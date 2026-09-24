// Input guardrails for the chat endpoint: size limits, history trimming,
// card-number redaction and a simple per-IP rate limit.

const LIMITS = {
  maxMessageChars: 1000,
  maxHistoryMessages: 20,
  maxToolIterations: 5,
  maxQuantity: 10,
  maxCartLines: 30,
  rateLimitPerMinute: 20,
};

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Replace anything that looks like a payment card number (13–19 digits passing Luhn)
function redactCardNumbers(text) {
  let redacted = false;
  const out = text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, match => {
    const digits = match.replace(/\D/g, '');
    if (!luhnValid(digits)) return match;
    redacted = true;
    return '[REDACTED CARD NUMBER]';
  });
  return { text: out, redacted };
}

// Accept only plain user/assistant text turns from the client — never system or tool roles
function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-LIMITS.maxHistoryMessages)
    .map(m => ({ role: m.role, content: m.content.slice(0, LIMITS.maxMessageChars) }))
    // Conversations must start with a user turn (drops UI greetings; some providers require it)
    .filter((m, i, arr) => arr.slice(0, i + 1).some(x => x.role === 'user'));
}

// Fixed-window in-memory rate limiter (per serverless instance — use Redis/KV in production)
const hits = new Map();
function rateLimit(req, res, next) {
  const windowStart = Math.floor(Date.now() / 60000);
  const key = `${req.ip}:${windowStart}`;
  const count = (hits.get(key) || 0) + 1;
  hits.set(key, count);
  if (hits.size > 10000) {
    for (const k of hits.keys()) if (!k.endsWith(`:${windowStart}`)) hits.delete(k);
  }
  if (count > LIMITS.rateLimitPerMinute) {
    return res.status(429).json({ success: false, message: 'Too many messages — please wait a minute and try again.' });
  }
  next();
}

module.exports = { LIMITS, redactCardNumbers, sanitizeHistory, rateLimit };
