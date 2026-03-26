const axios = require('axios');

const MPGS_VERSION = '73';

function getConfig() {
  const merchantId = (process.env.MPGS_MERCHANT_ID || '').trim();
  const apiPassword = (process.env.MPGS_API_PASSWORD || '').trim();
  const gatewayUrl = (process.env.MPGS_GATEWAY_URL || 'https://mtf.gateway.mastercard.com').trim();

  if (!merchantId || !apiPassword) {
    throw new Error('Mastercard gateway credentials not configured');
  }

  return { merchantId, apiPassword, gatewayUrl };
}

/**
 * Create a Hosted Checkout session using the same pattern as HCO-Payment-Page-Backend
 */
async function createCheckoutSession(orderId, amount, currency, returnUrl, description) {
  const { merchantId, apiPassword, gatewayUrl } = getConfig();

  // Build the MPGS API URL — same as HCO backend
  const url = `${gatewayUrl}/api/rest/version/${MPGS_VERSION}/merchant/${merchantId}/session`;

  // Auth: merchant.<MID>:<password> — same as HCO backend
  const username = `merchant.${merchantId}`;
  const auth = Buffer.from(`${username}:${apiPassword}`).toString('base64');

  const payload = {
    apiOperation: 'INITIATE_CHECKOUT',
    interaction: {
      operation: 'PURCHASE',
      returnUrl,
      merchant: {
        name: 'Meenakshi Pottery',
      },
      displayControl: {
        billingAddress: 'HIDE',
        shipping: 'HIDE',
      },
    },
    order: {
      id: orderId,
      amount: String(amount),
      currency: currency.toUpperCase(),
      description: description || `Pottery Store Order ${orderId}`,
    },
  };

  console.log('Creating MPGS session:', { url, merchantId, orderId, amount, currency });

  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('MPGS session created:', {
    sessionId: response.data.session?.id,
    successIndicator: response.data.successIndicator,
  });

  return {
    sessionId: response.data.session.id,
    successIndicator: response.data.successIndicator,
  };
}

/**
 * Retrieve order details from MPGS to verify payment
 */
async function retrieveOrder(orderId) {
  const { merchantId, apiPassword, gatewayUrl } = getConfig();

  const url = `${gatewayUrl}/api/rest/version/${MPGS_VERSION}/merchant/${merchantId}/order/${orderId}`;
  const username = `merchant.${merchantId}`;
  const auth = Buffer.from(`${username}:${apiPassword}`).toString('base64');

  const response = await axios.get(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

module.exports = {
  createCheckoutSession,
  retrieveOrder,
  MPGS_VERSION,
  getConfig,
};
