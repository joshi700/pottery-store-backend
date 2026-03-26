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
 * Process a Google Pay payment through MPGS
 * Uses the PAY operation with the encrypted Google Pay token
 */
async function processGooglePayPayment(orderId, transactionId, amount, currency, googlePayToken) {
  const { merchantId, apiPassword, gatewayUrl } = getConfig();

  // MPGS PAY endpoint
  const url = `${gatewayUrl}/api/rest/version/${MPGS_VERSION}/merchant/${merchantId}/order/${orderId}/transaction/${transactionId}`;

  const username = `merchant.${merchantId}`;
  const auth = Buffer.from(`${username}:${apiPassword}`).toString('base64');

  // Parse the Google Pay payment token
  // Google Pay returns paymentMethodData.tokenizationData.token as a JSON string
  let tokenData;
  try {
    tokenData = typeof googlePayToken === 'string' ? JSON.parse(googlePayToken) : googlePayToken;
  } catch (e) {
    tokenData = googlePayToken;
  }

  const payload = {
    apiOperation: 'PAY',
    order: {
      amount: String(amount),
      currency: currency.toUpperCase(),
    },
    sourceOfFunds: {
      type: 'CARD',
      provided: {
        card: {
          devicePayment: {
            paymentToken: JSON.stringify(tokenData),
          },
        },
      },
    },
  };

  console.log('Processing Google Pay via MPGS:', { url, merchantId, orderId, transactionId, amount, currency });

  const response = await axios.put(url, payload, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('MPGS Google Pay response:', {
    result: response.data.result,
    order: response.data.order?.id,
    transaction: response.data.transaction?.id,
    authCode: response.data.transaction?.authorizationCode,
  });

  return response.data;
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
  processGooglePayPayment,
  retrieveOrder,
  MPGS_VERSION,
  getConfig,
};
