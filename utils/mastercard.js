const https = require('https');

const MPGS_VERSION = '78';

function getConfig() {
  const merchantId = process.env.MPGS_MERCHANT_ID;
  const apiPassword = process.env.MPGS_API_PASSWORD;
  const gatewayUrl = process.env.MPGS_GATEWAY_URL || 'https://test-gateway.mastercard.com';

  if (!merchantId || !apiPassword) {
    throw new Error('Mastercard gateway credentials not configured');
  }

  return { merchantId, apiPassword, gatewayUrl };
}

/**
 * Make a request to the MPGS REST API
 */
function mpgsRequest(method, path, body = null) {
  const { merchantId, apiPassword, gatewayUrl } = getConfig();

  const url = new URL(`${gatewayUrl}/api/rest/version/${MPGS_VERSION}/merchant/${merchantId}${path}`);
  const auth = Buffer.from(`merchant.${merchantId}:${apiPassword}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error?.explanation || `MPGS API error: ${res.statusCode}`);
            err.response = parsed;
            err.statusCode = res.statusCode;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse MPGS response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Create a Hosted Checkout session
 * @param {string} orderId - Unique order ID
 * @param {number} amount - Amount in major currency units (e.g., rupees, not paise)
 * @param {string} currency - ISO 4217 currency code (e.g., 'INR')
 * @param {string} returnUrl - URL to redirect after payment
 * @param {object} orderDescription - Optional description
 * @returns {object} { sessionId, successIndicator }
 */
async function createCheckoutSession(orderId, amount, currency, returnUrl, orderDescription = '') {
  const { merchantId } = getConfig();

  const body = {
    apiOperation: 'INITIATE_CHECKOUT',
    interaction: {
      operation: 'PURCHASE',
      returnUrl,
      merchant: {
        name: 'Pottery Store',
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
      description: orderDescription || `Pottery Store Order ${orderId}`,
    },
  };

  const result = await mpgsRequest('POST', '/session', body);

  return {
    sessionId: result.session.id,
    successIndicator: result.successIndicator,
  };
}

/**
 * Retrieve order details from MPGS to verify payment
 * @param {string} orderId - The order ID used during checkout
 * @returns {object} MPGS order details
 */
async function retrieveOrder(orderId) {
  return mpgsRequest('GET', `/order/${orderId}`);
}

/**
 * Retrieve transaction details
 * @param {string} orderId - The order ID
 * @param {string} transactionId - The transaction ID
 * @returns {object} MPGS transaction details
 */
async function retrieveTransaction(orderId, transactionId) {
  return mpgsRequest('GET', `/order/${orderId}/transaction/${transactionId}`);
}

module.exports = {
  createCheckoutSession,
  retrieveOrder,
  retrieveTransaction,
};
