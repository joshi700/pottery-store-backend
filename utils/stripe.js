const Stripe = require('stripe');

let stripe;
function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

async function createPaymentIntent(amount, currency, metadata = {}) {
  return getStripe().paymentIntents.create({
    amount,
    currency,
    metadata,
    automatic_payment_methods: { enabled: true }
  });
}

async function confirmPaymentIntent(paymentIntentId, paymentMethodId) {
  return getStripe().paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId
  });
}

async function capturePaymentIntent(paymentIntentId) {
  return getStripe().paymentIntents.capture(paymentIntentId);
}

async function createRefund(paymentIntentId, amount) {
  const params = { payment_intent: paymentIntentId };
  if (amount) params.amount = amount;
  return getStripe().refunds.create(params);
}

async function getPaymentIntent(paymentIntentId) {
  return getStripe().paymentIntents.retrieve(paymentIntentId);
}

module.exports = {
  getStripe,
  createPaymentIntent,
  confirmPaymentIntent,
  capturePaymentIntent,
  createRefund,
  getPaymentIntent
};
