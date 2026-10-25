// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

// Simple per-instance rate limit: max requests per IP per minute.
const hits = new Map();
export function rateLimited(req, max = 12) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

// Returns an error response if the request is not allowed, otherwise null.
export function guard(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers["x-app-passcode"] !== pass) return res.status(401).json({ code: "unauthorized" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ code: "not_configured" });
  if (rateLimited(req)) return res.status(429).json({ code: "rate_limited" });
  return null;
}

export async function callClaude(body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (r.status === 429) throw { status: 429, code: "rate_limited" };
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error("Anthropic error", r.status, detail);
    throw { status: 502, code: "ai_error" };
  }
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}
