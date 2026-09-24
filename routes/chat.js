const express = require('express');
const mongoose = require('mongoose');
const { runAgent } = require('../agent/agent');
const { isConfigured } = require('../agent/llm');
const { LIMITS, rateLimit, redactCardNumbers, sanitizeHistory } = require('../agent/guardrails');

const router = express.Router();

// The app-wide CORS config allows every origin. The chat endpoint costs money per
// call, so browsers may only use it from the store's own site. Requests without an
// Origin header (curl, server-to-server) are still subject to the rate limit.
const ALLOWED_ORIGINS = new Set(
  (process.env.CHAT_ALLOWED_ORIGINS || `${process.env.CLIENT_URL || 'http://localhost:5173'},https://meenapottery.com,https://www.meenapottery.com`)
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

function allowedOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ success: false, message: 'Chat is only available on meenapottery.com' });
  }
  next();
}

// Client cart is untrusted: keep only well-formed product ids and sane quantities
function sanitizeCart(cart) {
  if (!Array.isArray(cart)) return [];
  return cart
    .filter(l => mongoose.isValidObjectId(l?.product_id) && Number.isInteger(l.quantity) && l.quantity > 0)
    .slice(0, LIMITS.maxCartLines)
    .map(l => ({ product_id: String(l.product_id), quantity: Math.min(l.quantity, 100) }));
}

function sanitizePage(page) {
  return typeof page === 'string' && /^\/[\w\-/]{0,100}$/.test(page) ? page : '/';
}

// @route   POST /api/chat
// @desc    AI shopping assistant
// @access  Public (rate limited)
router.post('/', allowedOrigin, rateLimit, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, message: 'The chat assistant is not available right now. Please email gaurav@meenapottery.com.' });
  }

  const rawLast = Array.isArray(req.body.messages) ? req.body.messages.at(-1)?.content : null;
  if (typeof rawLast === 'string' && rawLast.length > LIMITS.maxMessageChars) {
    return res.status(400).json({ success: false, message: `Messages are limited to ${LIMITS.maxMessageChars} characters.` });
  }
  const history = sanitizeHistory(req.body.messages);
  const last = history[history.length - 1];
  if (!last || last.role !== 'user' || !last.content.trim()) {
    return res.status(400).json({ success: false, message: 'messages must end with a non-empty user message' });
  }

  // Card numbers never reach the LLM
  let redacted = false;
  for (const m of history) {
    if (m.role !== 'user') continue;
    const r = redactCardNumbers(m.content);
    m.content = r.text;
    redacted = redacted || r.redacted;
  }

  try {
    const result = await runAgent(history, { cart: sanitizeCart(req.body.cart), page: sanitizePage(req.body.page) });
    res.json({ success: true, ...result, redacted });
  } catch (err) {
    console.error('[Chat] Agent error:', err.message);
    const busy = err.status === 429;
    res.status(busy ? 429 : 502).json({
      success: false,
      message: busy
        ? 'The assistant is busy right now. Please try again in a moment.'
        : 'The assistant is unavailable right now. Please try again, or email gaurav@meenapottery.com.',
    });
  }
});

module.exports = router;
