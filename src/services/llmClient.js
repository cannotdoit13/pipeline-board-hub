function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

function hasLlmConfig() {
  return Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
}

async function completeJson({ system, user, fallback }) {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  if (!apiKey) return fallback();

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM request failed: ${res.status} ${body.slice(0, 200)}`);
    }

    const payload = await res.json();
    const content = payload.choices?.[0]?.message?.content;
    return extractJson(content) || fallback();
  } catch (error) {
    console.warn(`LLM fallback used: ${error.message}`);
    return fallback();
  }
}

module.exports = { completeJson, hasLlmConfig };
