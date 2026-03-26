const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createCheckoutSession, retrieveOrder, MPGS_VERSION, getConfig } = require('../utils/mastercard');
const Order = require('../models/Order');
const Product = require('../models/Product');

// @route   POST /api/payment/create-order
// @desc    Create order and Mastercard Hosted Checkout session
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

    // Verify amount matches (round to 2 decimal places for float comparison)
    if (Math.abs(Math.round(calculatedTotal * 100) - Math.round(amount * 100)) > 1) {
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Create order in database
    const order = await Order.create({
      user: req.user.id,
      items: orderData.items,
      shippingAddress: orderData.shippingAddress,
      billingAddress: orderData.billingAddress,
      subtotal: orderData.subtotal,
      shippingCost: orderData.shippingCost || 0,
      total: amount,
      paymentMethod: 'mastercard',
      paymentStatus: 'pending'
    });

    // Build the return URL — frontend will verify payment on this page
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const returnUrl = `${clientUrl}/order-success?orderId=${order._id}&orderNumber=${order.orderNumber}`;

    // Create Mastercard Hosted Checkout session
    const { sessionId, successIndicator } = await createCheckoutSession(
      order.orderNumber,
      amount,
      'USD',
      returnUrl,
      `Order ${order.orderNumber}`
    );

    // Save MPGS session info on the order
    order.mpgsSessionId = sessionId;
    order.mpgsSuccessIndicator = successIndicator;
    await order.save();

    // Return session info + gateway config so frontend can load the checkout script
    const { gatewayUrl } = getConfig();

    res.json({
      success: true,
      order: {
        id: order.orderNumber,
        amount,
        currency: 'USD',
        orderId: order._id,
        orderNumber: order.orderNumber
      },
      sessionId,
      successIndicator,
      gatewayUrl,
      apiVersion: MPGS_VERSION,
      merchantName: 'Meenakshi Pottery'
    });
  } catch (error) {
    console.error('Create order error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.response?.data?.error?.explanation || error.message
    });
  }
});

// @route   POST /api/payment/verify
// @desc    Verify Mastercard payment after return from hosted checkout
// @access  Private
router.post('/verify', protect, async (req, res) => {
  try {
    const { orderId, resultIndicator } = req.body;

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

    // Check if the resultIndicator matches the successIndicator
    const paymentSuccessful = resultIndicator && resultIndicator === order.mpgsSuccessIndicator;

    if (paymentSuccessful) {
      order.paymentStatus = 'paid';
      order.orderStatus = 'received';
      order.statusHistory.push({
        status: 'received',
        updatedAt: new Date(),
        note: 'Payment received via Mastercard Hosted Checkout'
      });

      await order.save();

      // Decrease product quantities
      for (const item of order.items) {
        const product = await Product.findById(item.product._id || item.product);
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
    } else {
      order.paymentStatus = 'failed';
      await order.save();

      res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
});

module.exports = router;
