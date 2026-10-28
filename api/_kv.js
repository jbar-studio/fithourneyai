// Tiny Redis client for Upstash (connected through Vercel → Storage).
// Works with either name Vercel/Upstash gives the variables.
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvReady = () => !!(URL_() && TOKEN());

export async function kv(...cmd) {
  const r = await fetch(URL_(), {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN()}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("kv error: " + (j.error || r.status));
  return j.result;
}

export const passOK = (req) => !process.env.APP_PASSCODE || req.headers["x-app-passcode"] === process.env.APP_PASSCODE;

// What each reminder says. "title" for workout comes from the app's weekly plan.
export function message(r, dow) {
  switch (r.id) {
    case "workout": {
      const t = (r.titles && r.titles[dow]) || "Today's workout";
      return { title: "Workout time", body: `${t} today. Warm up 5 minutes, then knock out your checklist.` };
    }
    case "water": return { title: "Water check", body: "Back from school? Finish a bottle of water and tap it in the app." };
    case "night": return { title: "Night check-in", body: "Tick off today's checklists and log what you ate." };
    case "bed": return { title: "Bedtime", body: "Lights out. 9 hours of sleep is when your muscles grow." };
    default: return { title: "FitJourneyAI", body: r.text || "Quick check-in." };
  }
}
