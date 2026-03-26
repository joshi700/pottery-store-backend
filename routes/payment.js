const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createRazorpayOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  verifyWebhookSignature
} = require('../utils/razorpay');
const Order = require('../models/Order');
const Product = require('../models/Product');

// @route   POST /api/payment/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/create-order', protect, async (req, res) => {
  try {
    const { amount, orderData } = req.body;

    if (!amount || !orderData) {
      return res.status(400).json({
        success: false,
        message: 'Amount and order data are required'
      });
    }

    // Validate products availability and calculate total
    let calculatedTotal = 0;
    for (const item of orderData.items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.name}`
        });
      }

      if (!product.isInStock()) {
        return res.status(400).json({
          success: false,
          message: `Product out of stock: ${product.name}`
        });
      }

      if (product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient quantity for: ${product.name}`
        });
      }

      calculatedTotal += product.price * item.quantity;
    }

    // Add shipping cost
    calculatedTotal += orderData.shippingCost || 0;

    // Verify amount matches
    if (Math.abs(calculatedTotal - amount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Create temporary order in database
    const order = await Order.create({
      user: req.user.id,
      items: orderData.items,
      shippingAddress: orderData.shippingAddress,
      billingAddress: orderData.billingAddress,
      subtotal: orderData.subtotal,
      shippingCost: orderData.shippingCost || 0,
      total: amount,
      paymentStatus: 'pending'
    });

    // Create Razorpay order
    const razorpayOrder = await createRazorpayOrder(
      amount,
      order.orderNumber,
      {
        orderId: order._id.toString(),
        userId: req.user.id
      }
    );

    // Update order with Razorpay order ID
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId: order._id,
        orderNumber: order.orderNumber
      },
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// @route   POST /api/payment/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/verify', protect, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    } = req.body;

    // Verify signature
    const isValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Get order
    const order = await Order.findById(orderId).populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify order belongs to user
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get payment details from Razorpay
    const paymentDetails = await getPaymentDetails(razorpay_payment_id);

    // Update order
    order.paymentStatus = 'paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpaySignature = razorpay_signature;
    order.orderStatus = 'received';
    order.statusHistory.push({
      status: 'received',
      updatedAt: new Date(),
      note: 'Payment received successfully'
    });

    await order.save();

    // Decrease product quantities
    for (const item of order.items) {
      const product = await Product.findById(item.product._id);
      if (product) {
        await product.decreaseQuantity(item.quantity);
      }
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
});

// @route   POST /api/payment/webhook
// @desc    Handle Razorpay webhook
// @access  Public (but verified)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    
    // Verify webhook signature if webhook secret is configured
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(
        req.body,
        signature,
        process.env.RAZORPAY_WEBHOOK_SECRET
      );

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }
    }

    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    console.log('Webhook received:', event);

    switch (event) {
      case 'payment.authorized':
      case 'payment.captured':
        // Payment successful
        const order = await Order.findOne({
          razorpayOrderId: payload.order_id
        });

        if (order && order.paymentStatus === 'pending') {
          order.paymentStatus = 'paid';
          order.razorpayPaymentId = payload.id;
          order.orderStatus = 'received';
          order.statusHistory.push({
            status: 'received',
            updatedAt: new Date(),
            note: 'Payment captured via webhook'
          });
          await order.save();

          // Decrease product quantities
          for (const item of order.items) {
            const product = await Product.findById(item.product);
            if (product) {
              await product.decreaseQuantity(item.quantity);
            }
          }
        }
        break;

      case 'payment.failed':
        // Payment failed
        const failedOrder = await Order.findOne({
          razorpayOrderId: payload.order_id
        });

        if (failedOrder) {
          failedOrder.paymentStatus = 'failed';
          await failedOrder.save();
        }
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

module.exports = router;
