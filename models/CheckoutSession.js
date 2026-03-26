const mongoose = require('mongoose');
const crypto = require('crypto');

const lineItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  item: {
    id: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 }
  },
  name: String,
  image: String,
  base_amount: { type: Number, required: true },  // cents
  discount: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true }
}, { _id: false });

const fulfillmentOptionSchema = new mongoose.Schema({
  type: { type: String, enum: ['shipping', 'digital'], required: true },
  id: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: String,
  carrier: String,
  earliest_delivery_time: String,
  latest_delivery_time: String,
  subtotal: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  type: { type: String, enum: ['info', 'error'], required: true },
  content_type: { type: String, enum: ['plain', 'markdown'], default: 'plain' },
  content: { type: String, required: true },
  code: String,
  param: String
}, { _id: false });

const checkoutSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    unique: true,
    required: true,
    default: () => `cs_${crypto.randomUUID().replace(/-/g, '')}`
  },
  status: {
    type: String,
    enum: ['not_ready_for_payment', 'ready_for_payment', 'completed', 'canceled'],
    default: 'not_ready_for_payment'
  },
  currency: {
    type: String,
    default: 'inr'
  },

  // Original items from agent request
  items: [{
    id: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 }
  }],

  // Resolved line items with pricing (cents)
  lineItems: [lineItemSchema],

  // Buyer info
  buyer: {
    name: String,
    email: String,
    phone: String
  },

  // Fulfillment address (ACP format)
  fulfillmentAddress: {
    name: String,
    line_one: String,
    line_two: String,
    city: String,
    state: String,
    country: { type: String, default: 'US' },
    postal_code: String,
    phone_number: String
  },

  // Fulfillment options and selection
  selectedFulfillmentOptionId: String,
  fulfillmentOptions: [fulfillmentOptionSchema],

  // Totals (all in cents)
  totals: {
    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },

  // Payment provider info
  paymentProvider: {
    provider: { type: String, default: 'stripe' },
    supported_payment_methods: { type: [String], default: ['card'] }
  },

  // Messages (info/error)
  messages: [messageSchema],

  // Links
  links: {
    terms_of_service: String,
    privacy_policy: String,
    merchant_url: String
  },

  // Order reference (set on completion)
  order: {
    id: String,
    checkout_session_id: String,
    permalink_url: String
  },

  // Stripe
  stripePaymentIntentId: String,

  // Agent metadata
  metadata: { type: Map, of: String },

  // Idempotency
  idempotencyKey: String,

  // Session expiry
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  }
}, {
  timestamps: true
});

// Index for lookups
checkoutSessionSchema.index({ sessionId: 1 });
checkoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Format session for ACP response
checkoutSessionSchema.methods.toACPResponse = function () {
  const response = {
    id: this.sessionId,
    status: this.status,
    currency: this.currency,
    line_items: this.lineItems.map(li => ({
      id: li.id,
      item: li.item,
      base_amount: li.base_amount,
      discount: li.discount,
      subtotal: li.subtotal,
      tax: li.tax,
      total: li.total
    })),
    totals: this.totals,
    payment_provider: this.paymentProvider,
    messages: this.messages
  };

  if (this.buyer && this.buyer.name) {
    response.buyer = this.buyer;
  }

  if (this.fulfillmentAddress && this.fulfillmentAddress.line_one) {
    response.fulfillment_address = this.fulfillmentAddress;
  }

  if (this.fulfillmentOptions.length > 0) {
    response.fulfillment_options = this.fulfillmentOptions;
  }

  if (this.selectedFulfillmentOptionId) {
    response.selected_fulfillment_option_id = this.selectedFulfillmentOptionId;
  }

  if (this.links && this.links.merchant_url) {
    response.links = this.links;
  }

  if (this.order && this.order.id) {
    response.order = this.order;
  }

  return response;
};

module.exports = mongoose.model('CheckoutSession', checkoutSessionSchema);
