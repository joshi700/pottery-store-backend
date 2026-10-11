// Langfuse tracing for the chat assistant (OpenTelemetry based).
// Disabled unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set — the
// @langfuse/tracing calls in agent.js are then no-ops.
require('dotenv').config();
const { redactCardNumbers } = require('./guardrails');

const enabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
let spanProcessor = null;

// Belt and braces: card numbers are already redacted before the LLM sees them,
// but scrub anything that reaches a trace too
function maskCardNumbers({ data }) {
  if (typeof data === 'string') return redactCardNumbers(data).text;
  if (data == null || typeof data !== 'object') return data;
  try {
    return JSON.parse(redactCardNumbers(JSON.stringify(data)).text);
  } catch {
    return data;
  }
}

if (enabled) {
  const { LangfuseSpanProcessor } = require('@langfuse/otel');
  const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

  spanProcessor = new LangfuseSpanProcessor({
    // Serverless functions can freeze right after responding — don't hold spans in a batch
    exportMode: process.env.VERCEL ? 'immediate' : 'batched',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    mask: maskCardNumbers,
  });
  new NodeTracerProvider({ spanProcessors: [spanProcessor] }).register();
  console.log('[Chat] Langfuse tracing enabled');
}

// Send pending spans; call before the response so Vercel doesn't drop them
async function flushTraces() {
  if (!spanProcessor) return;
  try {
    await spanProcessor.forceFlush();
  } catch (err) {
    console.error('[Chat] Langfuse flush failed:', err.message);
  }
}

module.exports = { tracingEnabled: enabled, flushTraces };
