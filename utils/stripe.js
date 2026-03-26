const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a Stripe PaymentIntent for ACP checkout
 * @param {number} amount - Amount in minor units (paise)
 * @param {string} currency - ISO 4217 currency code (e.g., 'inr')
 * @param {object} metadata - Key-value metadata for the payment
 * @returns {object} Stripe PaymentIntent
 */
async function createPaymentIntent(amount, currency, metadata = {}) {
  return stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
    automatic_payment_methods: { enabled: true }
  });
}

/**
 * Confirm a PaymentIntent with a payment method
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @param {string} paymentMethodId - Stripe PaymentMethod ID or token
 * @returns {object} Confirmed PaymentIntent
 */
async function confirmPaymentIntent(paymentIntentId, paymentMethodId) {
  return stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId
  });
}

/**
 * Capture a PaymentIntent (if using manual capture)
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @returns {object} Captured PaymentIntent
 */
async function capturePaymentIntent(paymentIntentId) {
  return stripe.paymentIntents.capture(paymentIntentId);
}

/**
 * Create a refund for a PaymentIntent
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @param {number} amount - Amount to refund in minor units (optional, full refund if omitted)
 * @returns {object} Stripe Refund
 */
async function createRefund(paymentIntentId, amount) {
  const params = { payment_intent: paymentIntentId };
  if (amount) params.amount = amount;
  return stripe.refunds.create(params);
}

/**
 * Retrieve a PaymentIntent
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @returns {object} Stripe PaymentIntent
 */
async function getPaymentIntent(paymentIntentId) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

module.exports = {
  stripe,
  createPaymentIntent,
  confirmPaymentIntent,
  capturePaymentIntent,
  createRefund,
  getPaymentIntent
};
