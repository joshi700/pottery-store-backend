const express = require('express');
const router = express.Router();
const CheckoutSession = require('../models/CheckoutSession');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { verifyACPSignature, handleIdempotency } = require('../middleware/acpAuth');
const { createPaymentIntent, confirmPaymentIntent } = require('../utils/stripe');
const { sendOrderWebhook } = require('../utils/acpWebhooks');

// Apply ACP auth to all routes
router.use(verifyACPSignature);
router.use(handleIdempotency);

// ============================================================
// Helper: Resolve items → line items with pricing (cents)
// ============================================================
async function resolveLineItems(items, messages) {
  const lineItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await Product.findById(item.id);

    if (!product) {
      messages.push({
        type: 'error',
        code: 'out_of_stock',
        content: `Product not found: ${item.id}`,
        param: `items`
      });
      continue;
    }

    if (!product.isInStock()) {
      messages.push({
        type: 'error',
        code: 'out_of_stock',
        content: `${product.name} is out of stock`,
        param: `items`
      });
      continue;
    }

    if (product.quantity < item.quantity) {
      messages.push({
        type: 'error',
        code: 'out_of_stock',
        content: `Only ${product.quantity} available for ${product.name}`,
        param: `items`
      });
      continue;
    }

    const unitPricePaise = Math.round(product.price * 100);
    const qty = item.quantity;
    const lineTotal = unitPricePaise * qty;

    lineItems.push({
      id: `li_${product._id}`,
      item: { id: product._id.toString(), quantity: qty },
      name: product.name,
      image: product.images?.[0] || '',
      base_amount: lineTotal,
      discount: 0,
      subtotal: lineTotal,
      tax: 0,
      total: lineTotal
    });

    subtotal += lineTotal;
  }

  return { lineItems, subtotal };
}

// ============================================================
// Helper: Calculate fulfillment options
// ============================================================
function calculateFulfillmentOptions(subtotalCents) {
  const freeShippingThreshold = 15000; // $150 in cents
  const shippingCostCents = subtotalCents >= freeShippingThreshold ? 0 : 999; // $9.99

  const options = [
    {
      type: 'shipping',
      id: 'standard_shipping',
      title: 'Standard Shipping',
      subtitle: shippingCostCents === 0 ? 'Free shipping on orders over $150' : '5-7 business days',
      carrier: 'USPS / UPS',
      earliest_delivery_time: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      latest_delivery_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      subtotal: shippingCostCents,
      tax: 0,
      total: shippingCostCents
    }
  ];

  // Add express option
  options.push({
    type: 'shipping',
    id: 'express_shipping',
    title: 'Express Shipping',
    subtitle: '2-3 business days',
    carrier: 'FedEx / UPS Express',
    earliest_delivery_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    latest_delivery_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    subtotal: 1999, // $19.99
    tax: 0,
    total: 1999
  });

  return options;
}

// ============================================================
// Helper: Compute totals
// ============================================================
function computeTotals(lineItems, fulfillmentOptions, selectedFulfillmentId) {
  const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0);

  let shipping = 0;
  if (selectedFulfillmentId) {
    const selected = fulfillmentOptions.find(o => o.id === selectedFulfillmentId);
    if (selected) shipping = selected.total;
  } else if (fulfillmentOptions.length > 0) {
    // Default to first option
    shipping = fulfillmentOptions[0].total;
  }

  return {
    subtotal,
    shipping,
    tax: 0,
    discount: 0,
    total: subtotal + shipping
  };
}

// ============================================================
// Helper: Determine session status
// ============================================================
function determineStatus(session) {
  const hasErrors = session.messages.some(m => m.type === 'error');
  if (hasErrors) return 'not_ready_for_payment';

  const hasAddress = session.fulfillmentAddress && session.fulfillmentAddress.line_one;
  const hasItems = session.lineItems.length > 0;

  if (hasItems && hasAddress) return 'ready_for_payment';
  return 'not_ready_for_payment';
}

// ============================================================
// POST /checkout_sessions — Create checkout session
// ============================================================
router.post('/checkout_sessions', async (req, res) => {
  try {
    const { items, buyer, fulfillment_address } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'missing',
        message: 'items array is required and must not be empty',
        param: 'items'
      });
    }

    const messages = [];
    const { lineItems, subtotal } = await resolveLineItems(items, messages);

    if (lineItems.length === 0) {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'out_of_stock',
        message: 'No valid items could be added to the session'
      });
    }

    const fulfillmentOptions = calculateFulfillmentOptions(subtotal);
    const defaultFulfillmentId = fulfillmentOptions[0].id;

    const session = new CheckoutSession({
      items: items.map(i => ({ id: i.id, quantity: i.quantity })),
      lineItems,
      fulfillmentOptions,
      selectedFulfillmentOptionId: defaultFulfillmentId,
      messages,
      links: {
        merchant_url: process.env.CLIENT_URL || 'http://localhost:5173'
      },
      idempotencyKey: req.acp?.idempotencyKey
    });

    if (buyer) {
      session.buyer = {
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone
      };
    }

    if (fulfillment_address) {
      session.fulfillmentAddress = fulfillment_address;
    }

    session.totals = computeTotals(lineItems, fulfillmentOptions, defaultFulfillmentId);
    session.status = determineStatus(session);

    await session.save();

    res.status(201).json(session.toACPResponse());
  } catch (error) {
    console.error('ACP create session error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'Failed to create checkout session'
    });
  }
});

// ============================================================
// POST /checkout_sessions/:id — Update checkout session
// ============================================================
router.post('/checkout_sessions/:id', async (req, res) => {
  try {
    const session = await CheckoutSession.findOne({ sessionId: req.params.id });

    if (!session) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'not_found',
        message: 'Checkout session not found'
      });
    }

    if (session.status === 'completed' || session.status === 'canceled') {
      return res.status(405).json({
        type: 'invalid_request',
        code: 'invalid',
        message: `Cannot update a ${session.status} session`
      });
    }

    const { items, buyer, fulfillment_address, fulfillment_option_id } = req.body;

    // Clear previous messages
    session.messages = [];

    // Update items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      session.items = items.map(i => ({ id: i.id, quantity: i.quantity }));
      const { lineItems, subtotal } = await resolveLineItems(items, session.messages);
      session.lineItems = lineItems;
      session.fulfillmentOptions = calculateFulfillmentOptions(subtotal);
    }

    // Update buyer
    if (buyer) {
      session.buyer = {
        name: buyer.name || session.buyer?.name,
        email: buyer.email || session.buyer?.email,
        phone: buyer.phone || session.buyer?.phone
      };
    }

    // Update fulfillment address
    if (fulfillment_address) {
      session.fulfillmentAddress = fulfillment_address;
    }

    // Update selected fulfillment option
    if (fulfillment_option_id) {
      const validOption = session.fulfillmentOptions.find(o => o.id === fulfillment_option_id);
      if (validOption) {
        session.selectedFulfillmentOptionId = fulfillment_option_id;
      } else {
        session.messages.push({
          type: 'error',
          code: 'invalid',
          content: `Invalid fulfillment option: ${fulfillment_option_id}`,
          param: 'fulfillment_option_id'
        });
      }
    }

    // Recalculate totals
    session.totals = computeTotals(
      session.lineItems,
      session.fulfillmentOptions,
      session.selectedFulfillmentOptionId
    );

    // Determine status
    session.status = determineStatus(session);

    await session.save();

    res.json(session.toACPResponse());
  } catch (error) {
    console.error('ACP update session error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'Failed to update checkout session'
    });
  }
});

// ============================================================
// POST /checkout_sessions/:id/complete — Complete checkout
// ============================================================
router.post('/checkout_sessions/:id/complete', async (req, res) => {
  try {
    const session = await CheckoutSession.findOne({ sessionId: req.params.id });

    if (!session) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'not_found',
        message: 'Checkout session not found'
      });
    }

    if (session.status !== 'ready_for_payment') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'invalid',
        message: `Session is not ready for payment (current status: ${session.status})`
      });
    }

    const { payment_data, buyer } = req.body;

    if (!payment_data) {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'missing',
        message: 'payment_data is required',
        param: 'payment_data'
      });
    }

    // Update buyer if provided
    if (buyer) {
      session.buyer = {
        name: buyer.name || session.buyer?.name,
        email: buyer.email || session.buyer?.email,
        phone: buyer.phone || session.buyer?.phone
      };
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await createPaymentIntent(
      session.totals.total,
      session.currency,
      {
        checkout_session_id: session.sessionId,
        source: 'acp'
      }
    );

    session.stripePaymentIntentId = paymentIntent.id;

    // Confirm payment with the token from the agent
    const confirmedPayment = await confirmPaymentIntent(
      paymentIntent.id,
      payment_data.payment_method_id || payment_data.token
    );

    if (confirmedPayment.status !== 'succeeded' && confirmedPayment.status !== 'requires_capture') {
      session.messages = [{
        type: 'error',
        code: 'payment_declined',
        content: 'Payment could not be completed'
      }];
      await session.save();
      return res.status(400).json(session.toACPResponse());
    }

    // Convert ACP address to internal format
    const addr = session.fulfillmentAddress;
    const shippingAddress = {
      fullName: addr.name || session.buyer?.name || 'Customer',
      phone: addr.phone_number || session.buyer?.phone || '',
      addressLine1: addr.line_one || '',
      addressLine2: addr.line_two || '',
      city: addr.city || '',
      state: addr.state || '',
      zipCode: addr.postal_code || ''
    };

    // Build order items
    const orderItems = [];
    for (const li of session.lineItems) {
      const product = await Product.findById(li.item.id);
      if (product) {
        orderItems.push({
          product: product._id,
          name: product.name,
          image: product.images?.[0] || '',
          price: product.price,
          quantity: li.item.quantity
        });
        // Decrease stock
        await product.decreaseQuantity(li.item.quantity);
      }
    }

    // Create order
    const order = await Order.create({
      user: null, // ACP orders may not have a local user
      items: orderItems,
      shippingAddress,
      billingAddress: shippingAddress,
      subtotal: session.totals.subtotal / 100, // Convert cents to dollars
      shippingCost: session.totals.shipping / 100,
      total: session.totals.total / 100,
      paymentMethod: 'stripe',
      paymentStatus: 'paid',
      stripePaymentIntentId: paymentIntent.id,
      checkoutSessionId: session.sessionId,
      source: 'agent'
    });

    // Update session to completed
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    session.status = 'completed';
    session.order = {
      id: order._id.toString(),
      checkout_session_id: session.sessionId,
      permalink_url: `${clientUrl}/orders/${order._id}`
    };
    session.messages = [{
      type: 'info',
      content_type: 'plain',
      content: `Order ${order.orderNumber} placed successfully!`
    }];

    await session.save();

    // Send webhook (fire-and-forget)
    if (process.env.ACP_WEBHOOK_CALLBACK_URL) {
      sendOrderWebhook(process.env.ACP_WEBHOOK_CALLBACK_URL, {
        eventType: 'order_created',
        checkoutSessionId: session.sessionId,
        permalinkUrl: session.order.permalink_url,
        orderStatus: 'received'
      }).catch(err => console.error('Webhook send error:', err));
    }

    res.json(session.toACPResponse());
  } catch (error) {
    console.error('ACP complete session error:', error);

    // Handle Stripe-specific errors
    if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'payment_declined',
        message: error.message
      });
    }

    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'Failed to complete checkout'
    });
  }
});

// ============================================================
// POST /checkout_sessions/:id/cancel — Cancel checkout session
// ============================================================
router.post('/checkout_sessions/:id/cancel', async (req, res) => {
  try {
    const session = await CheckoutSession.findOne({ sessionId: req.params.id });

    if (!session) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'not_found',
        message: 'Checkout session not found'
      });
    }

    if (session.status === 'completed' || session.status === 'canceled') {
      return res.status(405).json({
        type: 'invalid_request',
        code: 'invalid',
        message: `Cannot cancel a ${session.status} session`
      });
    }

    session.status = 'canceled';
    session.messages = [{
      type: 'info',
      content_type: 'plain',
      content: 'Checkout session has been canceled'
    }];

    await session.save();

    res.json(session.toACPResponse());
  } catch (error) {
    console.error('ACP cancel session error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'Failed to cancel checkout session'
    });
  }
});

// ============================================================
// GET /checkout_sessions/:id — Get checkout session
// ============================================================
router.get('/checkout_sessions/:id', async (req, res) => {
  try {
    const session = await CheckoutSession.findOne({ sessionId: req.params.id });

    if (!session) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'not_found',
        message: 'Checkout session not found'
      });
    }

    res.json(session.toACPResponse());
  } catch (error) {
    console.error('ACP get session error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'Failed to retrieve checkout session'
    });
  }
});

module.exports = router;
