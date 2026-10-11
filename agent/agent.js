// Agent loop: send the conversation to the LLM, run any tool calls it makes,
// feed the results back, and repeat until it answers in plain text.
// Each turn is traced in Langfuse: agent → generation (LLM call) / tool spans.
const { startActiveObservation, startObservation, propagateAttributes } = require('@langfuse/tracing');
const { chatCompletion, llmConfig } = require('./llm');
const { TOOLS, runTool } = require('./tools');
const { buildSystemPrompt } = require('./prompt');
const { LIMITS } = require('./guardrails');

const TOO_MANY_STEPS = "Sorry, that took more steps than I'm allowed. Could you rephrase or break it into smaller requests?";
const EMPTY_REPLY = "Sorry, I didn't catch that. Could you ask again?";

async function tracedCompletion(messages, step) {
  const generation = startObservation(`llm-step-${step}`, {
    model: llmConfig.model,
    input: messages,
    modelParameters: { temperature: llmConfig.temperature, max_tokens: llmConfig.maxTokens, reasoning_effort: llmConfig.reasoningEffort || 'default' },
  }, { asType: 'generation' });
  try {
    const { message, usage, finishReason } = await chatCompletion(messages, TOOLS);
    generation.update({
      output: message,
      usageDetails: usage && { input: usage.prompt_tokens, output: usage.completion_tokens, total: usage.total_tokens },
      metadata: { finish_reason: finishReason },
      ...(finishReason === 'length' && { level: 'WARNING', statusMessage: 'Hit max_tokens' }),
    });
    return message;
  } catch (err) {
    generation.update({ level: 'ERROR', statusMessage: err.message });
    throw err;
  } finally {
    generation.end();
  }
}

async function tracedTool(call, ctx) {
  const tool = startObservation(call.function.name, { input: call.function.arguments }, { asType: 'tool' });
  const out = await runTool(call.function.name, call.function.arguments, ctx);
  tool.update({
    output: { result: out.result, actions: out.actions },
    ...(!out.ok && { level: 'WARNING', statusMessage: out.result.error }),
  });
  tool.end();
  return out;
}

// Cards lead with the products the reply names (in the order it names them), then
// the rest of the latest results — the reply only highlights one or two, but a
// "show me your vases" request should still show every vase
function cardsFor(reply, seen, latest) {
  const text = reply.toLowerCase();
  const named = seen
    .map(p => ({ p, at: text.indexOf(p.name.toLowerCase()) }))
    .filter(x => x.at !== -1)
    .sort((a, b) => a.at - b.at)
    .map(x => x.p);
  const rest = latest.filter(p => !named.includes(p));
  return [...named, ...rest].slice(0, 8);
}

async function loop(history, { cart, page }) {
  const ctx = { cart };
  const actions = [];
  const seen = new Map(); // every product any tool returned this turn
  let latest = [];
  const messages = [{ role: 'system', content: buildSystemPrompt({ page }) }, ...history];

  for (let i = 0; i < LIMITS.maxToolIterations; i++) {
    const reply = await tracedCompletion(messages, i + 1);
    const toolCalls = reply.tool_calls || [];
    if (!toolCalls.length) {
      const text = reply.content?.trim() || EMPTY_REPLY;
      return { reply: text, actions, products: cardsFor(text, [...seen.values()], latest) };
    }

    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const out = await tracedTool(call, ctx);
      if (out.actions) actions.push(...out.actions);
      if (out.products?.length) {
        latest = out.products;
        for (const p of out.products) seen.set(p.id, p);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result) });
    }
  }

  return { reply: TOO_MANY_STEPS, actions, products: [] };
}

async function runAgent(history, { cart, page, sessionId }) {
  return propagateAttributes({ traceName: 'chat-turn', sessionId: sessionId || undefined, tags: ['chat'] }, () =>
    startActiveObservation('chat-turn', async (agent) => {
      agent.update({ input: history[history.length - 1].content, metadata: { page, cart_lines: cart.length, history_length: history.length } });
      try {
        const result = await loop(history, { cart, page });
        agent.update({
          output: result.reply,
          metadata: { actions: result.actions.map(a => a.type), products_shown: result.products.length },
          ...(result.reply === TOO_MANY_STEPS && { level: 'WARNING', statusMessage: 'Tool step limit reached' }),
        });
        return result;
      } catch (err) {
        agent.update({ level: 'ERROR', statusMessage: err.message });
        throw err;
      }
    }, { asType: 'agent' })
  );
}

module.exports = { runAgent };
