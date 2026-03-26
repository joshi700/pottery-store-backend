const crypto = require('crypto');

// Map internal order statuses to ACP order event statuses
const STATUS_MAP = {
  received: 'created',
  in_progress: 'confirmed',
  shipped: 'shipped',
  delivered: 'fulfilled',
  cancelled: 'canceled'
};

/**
 * Sign a webhook payload with HMAC-SHA256
 * @param {string} payload - JSON string payload
 * @param {string} secret - Webhook signing secret
 * @returns {string} Base64-encoded HMAC signature
 */
function signWebhookPayload(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

/**
 * Send an ACP order webhook event
 * @param {string} callbackUrl - Agent's webhook callback URL
 * @param {object} options
 * @param {string} options.eventType - 'order_created' or 'order_updated'
 * @param {string} options.checkoutSessionId - ACP checkout session ID
 * @param {string} options.permalinkUrl - Order permalink URL
 * @param {string} options.orderStatus - Internal order status
 * @param {Array} options.refunds - Refund objects (optional)
 */
async function sendOrderWebhook(callbackUrl, options) {
  const {
    eventType,
    checkoutSessionId,
    permalinkUrl,
    orderStatus,
    refunds = []
  } = options;

  const webhookSecret = process.env.ACP_WEBHOOK_SECRET;
  const merchantName = process.env.ACP_MERCHANT_NAME || 'PotteryStore';

  const event = {
    type: eventType,
    data: {
      type: 'order',
      checkout_session_id: checkoutSessionId,
      permalink_url: permalinkUrl,
      status: STATUS_MAP[orderStatus] || orderStatus,
      refunds: refunds.map(r => ({
        type: r.type || 'original_payment',
        amount: r.amount
      }))
    },
    created_at: new Date().toISOString()
  };

  const payload = JSON.stringify(event);
  const headers = {
    'Content-Type': 'application/json'
  };

  if (webhookSecret) {
    headers[`${merchantName}-Signature`] = signWebhookPayload(payload, webhookSecret);
  }

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers,
      body: payload
    });

    if (!response.ok) {
      console.error(`ACP webhook delivery failed: ${response.status} ${response.statusText}`);
    }

    return { success: response.ok, status: response.status };
  } catch (error) {
    console.error('ACP webhook delivery error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendOrderWebhook, signWebhookPayload, STATUS_MAP };
