// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
//
// Works with whichever AI key is set in Vercel → Settings → Environment Variables:
//   OPENAI_API_KEY     (OpenAI / ChatGPT)    model: OPENAI_MODEL    (default gpt-5-mini)
//   GEMINI_API_KEY     (Google Gemini)       model: GEMINI_MODEL    (default gemini-2.5-flash)
//   ANTHROPIC_API_KEY  (Claude)              model: ANTHROPIC_MODEL (default claude-haiku-5-5)
// Set AI_PROVIDER to "openai", "gemini" or "anthropic" to force one when several keys exist.

export function provider() {
  const p = (process.env.AI_PROVIDER || "").toLowerCase();
  if (p) return p;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// Simple per-instance rate limit: max requests per IP per minute.
const hits = new Map();
function rateLimited(req, max = 12) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

// Sends an error response and returns true if the request is not allowed.
export function guard(req, res) {
  if (req.method !== "POST") { res.status(405).json({ code: "method_not_allowed" }); return true; }
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers["x-app-passcode"] !== pass) { res.status(401).json({ code: "unauthorized" }); return true; }
  if (!provider()) { res.status(500).json({ code: "not_configured" }); return true; }
  if (rateLimited(req)) { res.status(429).json({ code: "rate_limited" }); return true; }
  return false;
}

async function post(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (r.status === 429) throw { status: 429, code: "rate_limited" };
  if (!r.ok) {
    console.error("AI provider error", r.status, await r.text().catch(() => ""));
    throw { status: 502, code: "ai_error" };
  }
  return r.json();
}

/**
 * One call for every provider.
 * system: string; messages: [{role:"user"|"assistant", content:string}];
 * image: optional base64 JPEG attached to the last user message; maxTokens: reply length cap.
 */
export async function callAI({ system, messages, image, maxTokens = 600 }) {
  const p = provider();

  if (p === "openai") {
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const msgs = messages.map((m, i) => {
      if (image && i === messages.length - 1)
        return { role: "user", content: [{ type: "text", text: m.content }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }] };
      return { role: m.role, content: m.content };
    });
    const body = { model, messages: [{ role: "system", content: system || "" }, ...msgs], max_completion_tokens: maxTokens + 2000 };
    if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = "low";
    const j = await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body);
    return j.choices?.[0]?.message?.content || "";
  }

  if (p === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const contents = messages.map((m, i) => {
      const parts = [{ text: m.content }];
      if (image && i === messages.length - 1) parts.unshift({ inlineData: { mimeType: "image/jpeg", data: image } });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });
    const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (model.startsWith("gemini-2.5-flash")) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": process.env.GEMINI_API_KEY }, body);
    return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
  }

  if (p === "anthropic") {
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
    const msgs = messages.map((m, i) => {
      if (image && i === messages.length - 1)
        return { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }, { type: "text", text: m.content }] };
      return { role: m.role, content: m.content };
    });
    const body = { model, max_tokens: maxTokens, messages: msgs };
    if (system) body.system = system;
    const j = await post("https://api.anthropic.com/v1/messages", { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body);
    return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  throw { status: 500, code: "not_configured" };
}
