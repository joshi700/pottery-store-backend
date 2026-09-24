// Agent loop: send the conversation to the LLM, run any tool calls it makes,
// feed the results back, and repeat until it answers in plain text.
const { chatCompletion } = require('./llm');
const { TOOLS, runTool } = require('./tools');
const { buildSystemPrompt } = require('./prompt');
const { LIMITS } = require('./guardrails');

async function runAgent(history, { cart, page }) {
  const ctx = { cart };
  const actions = [];
  let products = [];
  const messages = [{ role: 'system', content: buildSystemPrompt({ page }) }, ...history];

  for (let i = 0; i < LIMITS.maxToolIterations; i++) {
    const reply = await chatCompletion(messages, TOOLS);
    const toolCalls = reply.tool_calls || [];
    if (!toolCalls.length) {
      return { reply: reply.content || '', actions, products };
    }

    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const out = await runTool(call.function.name, call.function.arguments, ctx);
      if (out.actions) actions.push(...out.actions);
      if (out.products?.length) products = out.products; // show the latest results as cards
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result) });
    }
  }

  return {
    reply: "Sorry, that took more steps than I'm allowed. Could you rephrase or break it into smaller requests?",
    actions,
    products,
  };
}

module.exports = { runAgent };
