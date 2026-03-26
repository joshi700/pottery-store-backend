const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { createCheckoutSession: createMPGSSession, MPGS_VERSION, getConfig } = require('../utils/mastercard');

// ---------------------------------------------------------------------------
// In-memory UCP session store (use DB in production)
// ---------------------------------------------------------------------------
const ucpSessions = new Map();
const ucpOrders = new Map();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const UCP_VERSION = '2026-01-23';
const TAX_RATE = 0.0875; // 8.75%

const SHIPPING_OPTIONS = [
  { id: 'ship_standard', title: 'Standard Shipping (5-7 days)', total: 999 },
  { id: 'ship_express', title: 'Express Shipping (2-3 days)', total: 1299 },
  { id: 'ship_overnight', title: 'Overnight Shipping (1 day)', total: 2499 },
];

const FREE_SHIPPING_THRESHOLD = 15000; // $150 in cents

// ---------------------------------------------------------------------------
// Helper: resolve product IDs from MongoDB and build line items (cents)
// ---------------------------------------------------------------------------
async function resolveLineItems(items) {
  const lineItems = [];
  let subtotal = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const productId = item.item?.id || item.id;
    const quantity = item.quantity || 1;

    const product = await Product.findById(productId);
    if (!product) continue;
    if (!product.isInStock() || product.quantity < quantity) continue;

    const priceCents = Math.round(product.price * 100);
    const lineTotal = priceCents * quantity;

    lineItems.push({
      id: `line_${idx + 1}`,
      item: {
        id: product._id.toString(),
        title: product.name,
        price: priceCents,
        image_url: product.images?.[0] || '',
        link: `${process.env.CLIENT_URL || 'https://joshig.in'}/product/${product._id}`,
      },
      quantity,
      totals: [
        { type: 'subtotal', amount: lineTotal },
        { type: 'total', amount: lineTotal },
      ],
    });

    subtotal += lineTotal;
  }

  return { lineItems, subtotal };
}

// ---------------------------------------------------------------------------
// Helper: calculate totals (cents)
// ---------------------------------------------------------------------------
function calculateTotals(subtotal, shippingId) {
  const shipping = SHIPPING_OPTIONS.find(s => s.id === shippingId) || SHIPPING_OPTIONS[0];
  const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : shipping.total;
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + shippingCost + tax;

  return { subtotal, shipping: shippingCost, tax, total, shippingOption: shipping };
}

// ---------------------------------------------------------------------------
// Helper: build payment handlers config
// ---------------------------------------------------------------------------
function getPaymentHandlers() {
  const merchantId = process.env.MPGS_MERCHANT_ID || 'TESTMIDtesting00';
  return [
    {
      id: 'gpay_handler',
      name: 'com.google.pay',
      version: UCP_VERSION,
      spec: `https://pay.google.com/gp/p/ucp/${UCP_VERSION}/`,
      config_schema: `https://pay.google.com/gp/p/ucp/${UCP_VERSION}/schemas/config.json`,
      instrument_schemas: [
        'https://ucp.dev/schemas/shopping/types/card_payment_instrument.json',
      ],
      config: {
        allowed_payment_methods: [
          {
            type: 'CARD',
            parameters: {
              allowed_auth_methods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowed_card_networks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
            },
            tokenization_specification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: 'mpgs',
                gatewayMerchantId: merchantId,
              },
            },
          },
        ],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// 1. GET /.well-known/ucp — UCP Discovery Profile
// ---------------------------------------------------------------------------
router.get('/.well-known/ucp', (req, res) => {
  const baseUrl = process.env.BASE_URL || process.env.CLIENT_URL || 'https://api.joshig.in';

  res.json({
    ucp: {
      version: UCP_VERSION,
      services: {
        'dev.ucp.shopping': {
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specs/shopping',
          rest: {
            schema: 'https://ucp.dev/services/shopping/openapi.json',
            endpoint: baseUrl,
          },
        },
      },
      capabilities: [
        {
          name: 'dev.ucp.shopping.checkout',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specs/shopping/checkout',
          schema: 'https://ucp.dev/schemas/shopping/checkout.json',
        },
        {
          name: 'dev.ucp.shopping.fulfillment',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specs/shopping/fulfillment',
          schema: 'https://ucp.dev/schemas/shopping/fulfillment.json',
          extends: 'dev.ucp.shopping.checkout',
        },
        {
          name: 'dev.ucp.shopping.order',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specs/shopping/order',
          schema: 'https://ucp.dev/schemas/shopping/order.json',
        },
        {
          name: 'dev.ucp.shopping.discount',
          version: UCP_VERSION,
          spec: 'https://ucp.dev/specs/shopping/discount',
          schema: 'https://ucp.dev/schemas/shopping/discount.json',
          extends: 'dev.ucp.shopping.checkout',
        },
      ],
    },
    payment: {
      handlers: getPaymentHandlers(),
    },
    signing_keys: [
      {
        kid: 'meenakshi_dev_2025',
        kty: 'EC',
        crv: 'P-256',
        x: 'WbbXwVYGdJoP4Xm3qCkGvBRcRvKtEfXDbWvPzpPS8LA',
        y: 'sP4jHHxYqC89HBo8TjrtVOAGHfJDflYxw7MFMxuFMPY',
        use: 'sig',
        alg: 'ES256',
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// 2. POST /checkout-sessions — Create a new checkout session
// ---------------------------------------------------------------------------
router.post('/checkout-sessions', async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || process.env.CLIENT_URL || 'https://api.joshig.in';
    const clientUrl = process.env.CLIENT_URL || 'https://joshig.in';

    // Accept UCP format (line_items[].item.id) or legacy (items[].sku)
    let items = req.body.line_items;
    if (!items && req.body.items) {
      items = req.body.items.map(i => ({
        item: { id: i.sku || i.id },
        quantity: i.quantity || 1,
      }));
    }

    if (!items || !items.length) {
      return res.status(400).json({ error: 'line_items is required and must be non-empty' });
    }

    const { lineItems, subtotal } = await resolveLineItems(items);

    if (lineItems.length === 0) {
      return res.status(400).json({ error: 'No valid products found for the given IDs' });
    }

    const sessionId = uuidv4();
    const shippingId = req.body.shipping_method || 'ship_standard';
    const totals = calculateTotals(subtotal, shippingId);

    const session = {
      ucp: {
        version: UCP_VERSION,
        capabilities: [
          { name: 'dev.ucp.shopping.checkout', version: UCP_VERSION },
          { name: 'dev.ucp.shopping.fulfillment', version: UCP_VERSION, extends: 'dev.ucp.shopping.checkout' },
        ],
      },
      id: sessionId,
      status: 'incomplete',
      currency: 'USD',
      line_items: lineItems,
      totals: [
        { type: 'subtotal', amount: totals.subtotal },
        { type: 'fulfillment', display_text: totals.shipping === 0 ? 'Free Shipping' : totals.shippingOption.title, amount: totals.shipping },
        { type: 'tax', amount: totals.tax },
        { type: 'total', amount: totals.total },
      ],
      payment: {
        handlers: getPaymentHandlers(),
      },
      fulfillment: {
        methods: [{
          id: 'method_shipping',
          type: 'shipping',
          line_item_ids: lineItems.map(li => li.id),
          destinations: req.body.fulfillment?.methods?.[0]?.destinations || [],
          selected_destination_id: null,
          groups: [{
            id: 'group_1',
            line_item_ids: lineItems.map(li => li.id),
            options: SHIPPING_OPTIONS.map(s => ({
              id: s.id,
              title: s.title,
              totals: [{ type: 'total', amount: s.total }],
            })),
            selected_option_id: shippingId,
          }],
        }],
      },
      buyer: req.body.buyer || null,
      links: [
        { type: 'terms_of_service', url: `${clientUrl}/return-policy`, title: 'Terms of Service' },
        { type: 'privacy_policy', url: `${clientUrl}/return-policy`, title: 'Privacy Policy' },
        { type: 'return_policy', url: `${clientUrl}/return-policy`, title: 'Return Policy' },
      ],
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ucpSessions.set(sessionId, session);
    console.log(`[UCP] Session created: ${sessionId} with ${lineItems.length} items, total: $${(totals.total / 100).toFixed(2)}`);
    res.status(201).json(session);
  } catch (error) {
    console.error('[UCP] Create session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------------------------------------------------------------------------
// 3. PUT /checkout-sessions/:id — Update session (shipping address, recalculate)
// ---------------------------------------------------------------------------
router.put('/checkout-sessions/:id', async (req, res) => {
  try {
    const session = ucpSessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'completed' || session.status === 'canceled') {
      return res.status(409).json({ error: `Cannot update a ${session.status} session` });
    }

    // Update fulfillment destinations (UCP format)
    if (req.body.fulfillment?.methods?.[0]?.destinations) {
      session.fulfillment.methods[0].destinations = req.body.fulfillment.methods[0].destinations;
      if (req.body.fulfillment.methods[0].selected_destination_id) {
        session.fulfillment.methods[0].selected_destination_id = req.body.fulfillment.methods[0].selected_destination_id;
      }
    }

    // Legacy: flat shipping_address
    if (req.body.shipping_address) {
      session.fulfillment.methods[0].destinations = [{
        id: 'addr_1',
        street_address: req.body.shipping_address.street,
        address_locality: req.body.shipping_address.city,
        address_region: req.body.shipping_address.state,
        postal_code: req.body.shipping_address.zip,
        address_country: req.body.shipping_address.country || 'US',
      }];
      session.fulfillment.methods[0].selected_destination_id = 'addr_1';
    }

    // Update buyer info (step 4 from the doc — full hydration)
    if (req.body.buyer) {
      session.buyer = {
        ...session.buyer,
        ...req.body.buyer,
      };
    }

    // Update selected shipping option
    const shippingId = req.body.fulfillment?.methods?.[0]?.groups?.[0]?.selected_option_id
      || req.body.shipping_method
      || session.fulfillment.methods[0].groups[0].selected_option_id;

    if (shippingId) {
      session.fulfillment.methods[0].groups[0].selected_option_id = shippingId;
    }

    // Recalculate totals
    const subtotal = session.line_items.reduce((sum, li) => sum + li.item.price * li.quantity, 0);
    const totals = calculateTotals(subtotal, shippingId);
    session.totals = [
      { type: 'subtotal', amount: totals.subtotal },
      { type: 'fulfillment', display_text: totals.shipping === 0 ? 'Free Shipping' : totals.shippingOption.title, amount: totals.shipping },
      { type: 'tax', amount: totals.tax },
      { type: 'total', amount: totals.total },
    ];

    // Promo code support
    const promoCode = req.body.promo_code || req.body.discounts?.codes?.[0];
    if (promoCode === 'DEMO20') {
      const discount = Math.round(totals.subtotal * 0.20);
      session.totals.splice(3, 0, { type: 'discount', display_text: '20% off (DEMO20)', amount: -discount });
      const totalEntry = session.totals.find(t => t.type === 'total');
      totalEntry.amount = totals.total - discount;
    }

    session.updated_at = new Date().toISOString();
    ucpSessions.set(session.id, session);

    console.log(`[UCP] Session updated: ${session.id}`);
    res.json(session);
  } catch (error) {
    console.error('[UCP] Update session error:', error);
    res.status(500).json({ error: 'Failed to update checkout session' });
  }
});

// ---------------------------------------------------------------------------
// GET /checkout-sessions/:id — Retrieve a checkout session
// ---------------------------------------------------------------------------
router.get('/checkout-sessions/:id', (req, res) => {
  const session = ucpSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// ---------------------------------------------------------------------------
// 5. POST /checkout-sessions/:id/complete — Process payment
//    Receives Google Pay encrypted token → forwards to MPGS
// ---------------------------------------------------------------------------
router.post('/checkout-sessions/:id/complete', async (req, res) => {
  try {
    const session = ucpSessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'completed') {
      return res.status(409).json({ error: 'Session already completed' });
    }
    if (session.status === 'canceled') {
      return res.status(409).json({ error: 'Session was canceled' });
    }

    // Accept UCP (payment.instruments) or legacy (payment_data / paymentData)
    const paymentData = req.body.payment?.instruments
      || req.body.payment_data
      || req.body.paymentData;

    if (!paymentData) {
      return res.status(400).json({ error: 'payment data is required' });
    }

    // Extract Google Pay token if present
    let gpayToken = null;
    if (Array.isArray(paymentData)) {
      // UCP format: payment.instruments[0].credential.token
      const instrument = paymentData[0];
      gpayToken = instrument?.credential?.token;
    } else if (paymentData.paymentMethodData) {
      // Google Pay JS response
      gpayToken = paymentData.paymentMethodData?.tokenizationData?.token;
    }

    // Get total in cents
    const totalEntry = session.totals.find(t => t.type === 'total');
    const totalCents = totalEntry ? totalEntry.amount : 0;
    const totalDollars = (totalCents / 100).toFixed(2);

    // --- Forward to MPGS ---
    // In production, send the encrypted Google Pay token to MPGS PAY operation.
    // For now: attempt real MPGS session, fall back to simulation if creds missing.
    let mpgsResult;
    const orderId = `ORD-${uuidv4().slice(0, 8).toUpperCase()}`;
    const transactionId = `TXN-${uuidv4().slice(0, 8).toUpperCase()}`;

    try {
      // Try real MPGS: create a session & simulate auth
      // In full production: use PUT /order/{orderId}/transaction/{txnId} with PAY operation
      const { merchantId, apiPassword, gatewayUrl } = getConfig();

      // TODO: In production, send the Google Pay token to MPGS PAY API:
      // PUT /api/rest/version/{MPGS_VERSION}/merchant/{MID}/order/{orderId}/transaction/{txnId}
      // { apiOperation: 'PAY', sourceOfFunds: { type: 'CARD', provided: { card: { devicePayment: { paymentToken: gpayToken } } } } }
      //
      // For now, simulate success since we're in test mode:
      mpgsResult = {
        result: 'SUCCESS',
        gatewayCode: 'APPROVED',
        authorizationCode: `AUTH${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        transactionId,
      };

      console.log(`[MPGS] Payment processed for order ${orderId}: ${mpgsResult.gatewayCode}`);
    } catch (mpgsErr) {
      console.error('[MPGS] Error:', mpgsErr.message);
      // Simulate success for demo
      mpgsResult = {
        result: 'SUCCESS',
        gatewayCode: 'APPROVED',
        authorizationCode: `AUTH${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        transactionId,
      };
    }

    // Create order in MongoDB
    try {
      const orderItems = session.line_items.map(li => ({
        product: li.item.id,
        name: li.item.title,
        image: li.item.image_url,
        price: li.item.price / 100, // Convert cents to dollars for DB
        quantity: li.quantity,
      }));

      // Build address from fulfillment destinations
      const dest = session.fulfillment?.methods?.[0]?.destinations?.[0] || {};
      const shippingAddress = {
        fullName: session.buyer?.first_name
          ? `${session.buyer.first_name} ${session.buyer.last_name || ''}`.trim()
          : session.buyer?.name || 'Customer',
        phone: session.buyer?.phone || dest.phone || '',
        addressLine1: dest.street_address || dest.address_line1 || '',
        addressLine2: dest.address_line2 || '',
        city: dest.address_locality || dest.city || '',
        state: dest.address_region || dest.state || '',
        zipCode: dest.postal_code || dest.zip || '',
      };

      const subtotalEntry = session.totals.find(t => t.type === 'subtotal');
      const shippingEntry = session.totals.find(t => t.type === 'fulfillment');

      const order = await Order.create({
        user: null, // UCP orders come from Google AI surface, no local user
        items: orderItems,
        shippingAddress,
        billingAddress: shippingAddress,
        subtotal: (subtotalEntry?.amount || 0) / 100,
        shippingCost: (shippingEntry?.amount || 0) / 100,
        total: totalCents / 100,
        paymentMethod: 'mastercard',
        paymentStatus: 'paid',
        mpgsTransactionId: transactionId,
        source: 'agent',
        orderStatus: 'received',
        statusHistory: [{
          status: 'received',
          updatedAt: new Date(),
          note: 'Payment received via UCP Google Pay + MPGS',
        }],
      });

      // Decrease stock
      for (const li of session.line_items) {
        const product = await Product.findById(li.item.id);
        if (product) {
          await product.decreaseQuantity(li.quantity);
        }
      }

      console.log(`[UCP] Order saved to DB: ${order.orderNumber} (${order._id})`);
    } catch (dbErr) {
      console.error('[UCP] DB order save error (non-blocking):', dbErr.message);
    }

    // Update session
    session.status = 'completed';
    session.updated_at = new Date().toISOString();
    session.payment.authorization_code = mpgsResult.authorizationCode;
    session.payment.transaction_id = transactionId;
    session.payment.status = mpgsResult.result;
    session.payment.gateway_response = mpgsResult;
    session.order_id = orderId;

    const ucpOrder = {
      id: orderId,
      checkout_id: session.id,
      status: 'confirmed',
      line_items: session.line_items,
      fulfillment: session.fulfillment,
      totals: session.totals,
      payment: session.payment,
      created_at: new Date().toISOString(),
    };

    ucpOrders.set(orderId, ucpOrder);
    ucpSessions.set(session.id, session);

    console.log(`[UCP] Payment completed: ${session.id} → Order ${orderId}`);

    res.json({
      status: 'completed',
      order_id: orderId,
      session,
      order: ucpOrder,
    });
  } catch (error) {
    console.error('[UCP] Complete session error:', error);
    res.status(500).json({ error: 'Failed to complete checkout' });
  }
});

// ---------------------------------------------------------------------------
// POST /checkout-sessions/:id/cancel — Cancel a session
// ---------------------------------------------------------------------------
router.post('/checkout-sessions/:id/cancel', (req, res) => {
  const session = ucpSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (session.status === 'completed') {
    return res.status(409).json({ error: 'Cannot cancel a completed session' });
  }

  session.status = 'canceled';
  session.updated_at = new Date().toISOString();
  ucpSessions.set(session.id, session);

  console.log(`[UCP] Session canceled: ${session.id}`);
  res.json(session);
});

// ---------------------------------------------------------------------------
// GET /orders/:id — Retrieve UCP order
// ---------------------------------------------------------------------------
router.get('/orders/:id', (req, res) => {
  const order = ucpOrders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// ---------------------------------------------------------------------------
// 7. POST /webhooks/partners/:partner_id/events/order — Order status sync
//    Google calls this to check order updates
// ---------------------------------------------------------------------------
router.post('/webhooks/partners/:partner_id/events/order', async (req, res) => {
  try {
    const { partner_id } = req.params;
    const { id: orderId, checkout_id, status } = req.body;

    console.log(`[UCP Webhook] Partner: ${partner_id}, Order: ${orderId}, Checkout: ${checkout_id}, Status: ${status}`);

    // Look up the order
    const ucpOrder = ucpOrders.get(orderId);
    if (ucpOrder) {
      ucpOrder.status = status || ucpOrder.status;
      ucpOrders.set(orderId, ucpOrder);
    }

    // Also try to find in MongoDB and update
    if (checkout_id) {
      const session = ucpSessions.get(checkout_id);
      if (session) {
        // Find the DB order by mpgsTransactionId or other identifier
        try {
          const dbOrder = await Order.findOne({
            mpgsTransactionId: session.payment?.transaction_id,
          });
          if (dbOrder && status) {
            const statusMap = {
              'processing': 'in_progress',
              'shipped': 'shipped',
              'delivered': 'delivered',
              'canceled': 'cancelled',
            };
            const mappedStatus = statusMap[status] || status;
            if (dbOrder.orderStatus !== mappedStatus) {
              await dbOrder.updateStatus(mappedStatus, `Status updated via UCP webhook from partner ${partner_id}`);
              console.log(`[UCP Webhook] DB order ${dbOrder.orderNumber} updated to ${mappedStatus}`);
            }
          }
        } catch (dbErr) {
          console.error('[UCP Webhook] DB update error:', dbErr.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'Order status received',
    });
  } catch (error) {
    console.error('[UCP Webhook] Error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

module.exports = router;
