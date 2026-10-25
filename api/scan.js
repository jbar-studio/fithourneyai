import { guard, callClaude } from "./_shared.js";

const PROMPT = `This photo shows a food nutrition label (Nutrition Facts) or a food package. Read it and return ONLY JSON:
{"name": short product name or best guess (string), "serving": serving size as printed (string), "cal": calories per serving (number), "p": protein grams (number), "c": total carbohydrate grams (number), "f": total fat grams (number), "ok": true if you could read a nutrition label, else false}
Use per-serving values, not per-container. Use 0 for anything missing.`;

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const image = (req.body || {}).image;
  if (typeof image !== "string" || !image || image.length > 4_000_000) return res.status(400).json({ code: "bad_image" });

  try {
    const text = await callClaude({
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    });
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    let out = { ok: false };
    if (a >= 0 && b > a) { try { out = JSON.parse(text.slice(a, b + 1)); } catch {} }
    res.status(200).json(out);
  } catch (e) {
    res.status(e.status || 500).json({ code: e.code || "ai_error" });
  }
}
