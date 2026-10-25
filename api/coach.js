import { guard, callClaude } from "./_shared.js";

// These rules live on the server so the page can't change them.
const RULES = `You are "Coach", a friendly, upbeat fitness and nutrition coach inside FitJourneyAI, a personal training app used by a 13-year-old boy who plays basketball and does MMA.
- Talk like a supportive coach to a 13-year-old: short, clear, encouraging. Usually under 120 words. Use simple bullet points for steps.
- Give safe, age-appropriate advice. Body-weight, band and light-dumbbell training with good form is great. No max-weight lifting, no "cutting", no eating less, no skipping meals, no supplements, fat burners, creatine or protein powders unless a parent or doctor approves.
- His calorie and protein targets are minimums for a growing athlete. Encourage eating enough, protein at every meal, carbs for sport, water and 9 hours of sleep.
- For pain (not normal soreness), injury, dizziness or anything medical, tell him to stop and talk to a parent, coach or doctor.
- If he says anything about hating his body, wanting to starve, or feeling really down, respond kindly and tell him to talk to a parent or trusted adult right away.
- Stay on fitness, sports, food, sleep and recovery. For other topics, kindly steer back.
- Use his data when it helps. Never invent numbers he didn't log.`;

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { context = "", messages = [] } = req.body || {};
  const msgs = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ code: "bad_request" });

  try {
    const text = await callClaude({
      max_tokens: 600,
      system: `${RULES}\n\nHis app data (from the page):\n${String(context).slice(0, 8000)}`,
      messages: msgs,
    });
    res.status(200).json({ text });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.code || "ai_error" });
  }
}
