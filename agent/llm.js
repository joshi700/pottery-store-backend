// Minimal client for any OpenAI-compatible Chat Completions API
// (Google Gemini, Groq, OpenRouter, OpenAI, ...). Switch providers via env vars.
require('dotenv').config();

const llmConfig = {
  baseUrl: (process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL || 'gemini-2.5-flash',
  maxTokens: 800,
  timeoutMs: 30000,
};

function isConfigured() {
  return Boolean(llmConfig.apiKey);
}

async function chatCompletion(messages, tools) {
  const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages,
      tools,
      temperature: 0.3,
      max_tokens: llmConfig.maxTokens,
    }),
    signal: AbortSignal.timeout(llmConfig.timeoutMs),
  });

  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`LLM request failed (${res.status}): ${detail.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.choices[0].message;
}

module.exports = { chatCompletion, isConfigured, llmConfig };
