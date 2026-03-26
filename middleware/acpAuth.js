const crypto = require('crypto');

// In-memory idempotency cache (TTL: 1 hour)
const idempotencyCache = new Map();

// Clean expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now - entry.timestamp > 60 * 60 * 1000) {
      idempotencyCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Verify HMAC signature on incoming ACP requests.
 * Checks Signature and Timestamp headers.
 * Extracts API-Version, Request-Id, Idempotency-Key into req.acp.
 */
function verifyACPSignature(req, res, next) {
  const merchantSecret = process.env.ACP_MERCHANT_SECRET;

  // If no secret configured, skip verification (development mode)
  if (!merchantSecret) {
    req.acp = {
      apiVersion: req.headers['api-version'] || '2026-01-30',
      requestId: req.headers['request-id'],
      idempotencyKey: req.headers['idempotency-key'],
      acceptLanguage: req.headers['accept-language'] || 'en-us'
    };
    return next();
  }

  const signature = req.headers['signature'];
  const timestamp = req.headers['timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).json({
      type: 'invalid_request',
      code: 'missing_signature',
      message: 'Signature and Timestamp headers are required'
    });
  }

  // Reject if timestamp is older than 5 minutes
  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return res.status(401).json({
      type: 'invalid_request',
      code: 'expired_timestamp',
      message: 'Request timestamp is too old or invalid'
    });
  }

  // Verify HMAC-SHA256 signature
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', merchantSecret)
    .update(body)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return res.status(401).json({
      type: 'invalid_request',
      code: 'invalid_signature',
      message: 'Request signature verification failed'
    });
  }

  // Extract ACP headers
  req.acp = {
    apiVersion: req.headers['api-version'] || '2026-01-30',
    requestId: req.headers['request-id'],
    idempotencyKey: req.headers['idempotency-key'],
    acceptLanguage: req.headers['accept-language'] || 'en-us'
  };

  next();
}

/**
 * Idempotency middleware — returns cached response for duplicate Idempotency-Key.
 */
function handleIdempotency(req, res, next) {
  const key = req.acp?.idempotencyKey;
  if (!key) return next();

  const cached = idempotencyCache.get(key);
  if (cached) {
    return res.status(cached.statusCode).json(cached.body);
  }

  // Monkey-patch res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    idempotencyCache.set(key, {
      statusCode: res.statusCode,
      body,
      timestamp: Date.now()
    });
    return originalJson(body);
  };

  next();
}

module.exports = { verifyACPSignature, handleIdempotency };
