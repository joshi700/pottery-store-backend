const express = require('express');
const router = express.Router();
const { processGooglePayPayment, retrieveOrder, MPGS_VERSION, getConfig } = require('../utils/mastercard');
const Order = require('../models/Order');
const Product = require('../models/Product');

// @route   POST /api/payment/create-order
// @desc    Create order in database (no MPGS session needed for Google Pay)
// @access  Public (guest checkout)
router.post('/create-order', async (req, res) => {
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

    // Create order in database (guest checkout - no user required)
    const order = await Order.create({
      user: null,
      items: orderData.items,
      shippingAddress: orderData.shippingAddress,
      billingAddress: orderData.billingAddress,
      subtotal: orderData.subtotal,
      shippingCost: orderData.shippingCost || 0,
      total: amount,
      paymentMethod: 'mastercard',
      paymentStatus: 'pending'
    });

    // Return order info + Google Pay config
    const { merchantId, gatewayUrl } = getConfig();

    res.json({
      success: true,
      order: {
        id: order.orderNumber,
        amount,
        currency: 'USD',
        orderId: order._id,
        orderNumber: order.orderNumber
      },
      // Google Pay + MPGS config for frontend
      googlePay: {
        gateway: 'mpgs',
        gatewayMerchantId: merchantId,
        merchantName: 'Meenakshi Pottery',
        environment: (gatewayUrl.includes('mtf') || gatewayUrl.includes('test')) ? 'TEST' : 'PRODUCTION',
      }
    });
  } catch (error) {
    console.error('Create order error:', error.response?.data || error.message);
    console.error('Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.response?.data?.error?.explanation || error.message,
      debug: {
        name: error.name,
        code: error.code,
        status: error.response?.status,
      }
    });
  }
});

// @route   POST /api/payment/process-googlepay
// @desc    Process Google Pay payment token through MPGS
// @access  Public (guest checkout)
router.post('/process-googlepay', async (req, res) => {
  try {
    const { orderId, paymentData } = req.body;

    if (!orderId || !paymentData) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and payment data are required'
      });
    }

    const order = await Order.findById(orderId).populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Don't process already paid orders
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order already paid'
      });
    }

    // Extract the Google Pay token from payment data
    const googlePayToken = paymentData.paymentMethodData?.tokenizationData?.token;

    if (!googlePayToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Pay payment data — missing token'
      });
    }

    // Generate a unique transaction ID
    const transactionId = `TXN${Date.now()}`;

    // Check if we're in test/MTF environment
    const { gatewayUrl } = getConfig();
    const isTestEnv = gatewayUrl.includes('mtf') || gatewayUrl.includes('test');

    let paymentSuccess = false;
    let authCode = 'N/A';
    let mpgsTransactionId = transactionId;

    if (isTestEnv) {
      // In MPGS test environment, Google Pay tokens can't be processed.
      // Google Pay completed successfully on the client side, so mark as paid.
      console.log('TEST MODE: Skipping MPGS processing, marking Google Pay order as paid');
      paymentSuccess = true;
      authCode = 'TEST_GPAY';
    } else {
      // Production: Process payment through MPGS
      try {
        const mpgsResponse = await processGooglePayPayment(
          order.orderNumber,
          transactionId,
          order.total,
          'USD',
          googlePayToken
        );

        if (mpgsResponse.result === 'SUCCESS') {
          paymentSuccess = true;
          authCode = mpgsResponse.transaction?.authorizationCode || 'N/A';
          mpgsTransactionId = mpgsResponse.transaction?.id || transactionId;
        } else {
          order.paymentStatus = 'failed';
          order.statusHistory.push({
            status: 'payment_failed',
            updatedAt: new Date(),
            note: `MPGS response: ${mpgsResponse.result || 'UNKNOWN'}`
          });
          await order.save();

          return res.status(400).json({
            success: false,
            message: 'Payment processing failed',
            mpgsResult: mpgsResponse.result,
          });
        }
      } catch (mpgsErr) {
        console.error('MPGS processing failed:', mpgsErr.response?.data || mpgsErr.message);
        order.paymentStatus = 'failed';
        order.statusHistory.push({
          status: 'payment_failed',
          updatedAt: new Date(),
          note: `MPGS error: ${mpgsErr.response?.data?.error?.explanation || mpgsErr.message}`
        });
        await order.save();

        return res.status(500).json({
          success: false,
          message: 'Payment gateway processing failed',
        });
      }
    }

    if (paymentSuccess) {
      order.paymentStatus = 'paid';
      order.orderStatus = 'received';
      order.mpgsTransactionId = mpgsTransactionId;
      order.statusHistory.push({
        status: 'received',
        updatedAt: new Date(),
        note: `Payment received via Google Pay (Auth: ${authCode})`
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
        message: 'Payment processed successfully',
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          status: order.orderStatus,
          paymentStatus: order.paymentStatus
        }
      });
    }
  } catch (error) {
    console.error('Process Google Pay error:', error.response?.data || error.message);
    console.error('Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.response?.data?.error?.explanation || error.message,
      debug: {
        name: error.name,
        code: error.code,
        status: error.response?.status,
        mpgsError: error.response?.data,
      }
    });
  }
});

// @route   GET /api/payment/config
// @desc    Get Google Pay + MPGS config for frontend
// @access  Public
router.get('/config', (req, res) => {
  try {
    const { merchantId, gatewayUrl } = getConfig();
    const isTest = gatewayUrl.includes('mtf') || gatewayUrl.includes('test');

    res.json({
      success: true,
      googlePay: {
        gateway: 'mpgs',
        gatewayMerchantId: merchantId,
        merchantName: 'Meenakshi Pottery',
        environment: isTest ? 'TEST' : 'PRODUCTION',
        allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Payment configuration not available',
    });
  }
});

// @route   GET /api/payment/config-check
// @desc    Check if MPGS config is set (debug)
// @access  Public
router.get('/config-check', (req, res) => {
  const merchantId = (process.env.MPGS_MERCHANT_ID || '').trim();
  const hasApiPassword = !!(process.env.MPGS_API_PASSWORD || '').trim();
  const gatewayUrl = (process.env.MPGS_GATEWAY_URL || 'https://mtf.gateway.mastercard.com').trim();
  const clientUrl = (process.env.CLIENT_URL || '').trim();

  res.json({
    success: true,
    config: {
      MPGS_MERCHANT_ID: merchantId ? `SET (${merchantId})` : 'NOT SET',
      MPGS_API_PASSWORD: hasApiPassword ? 'SET (hidden)' : 'NOT SET',
      MPGS_GATEWAY_URL: gatewayUrl,
      CLIENT_URL: clientUrl || 'NOT SET',
    }
  });
});

module.exports = router;
