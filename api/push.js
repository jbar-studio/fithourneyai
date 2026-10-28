import webpush from "web-push";
import crypto from "node:crypto";
import { kv, kvReady, passOK, message } from "./_kv.js";

// Keys for signing notifications. Made once and kept in storage, so nothing to paste into settings.
export async function vapid() {
  let v = await kv("GET", "vapid");
  if (v) return JSON.parse(v);
  const k = webpush.generateVAPIDKeys();
  await kv("SET", "vapid", JSON.stringify(k), "NX");
  return JSON.parse(await kv("GET", "vapid"));
}

export function useVapid(v) {
  webpush.setVapidDetails("https://fitjourneyai.jbar.studio", v.publicKey, v.privateKey);
}

const idFor = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 20);

const cleanReminders = (list) => (Array.isArray(list) ? list : []).slice(0, 10).map((r) => ({
  id: String(r.id || "").slice(0, 20),
  on: !!r.on,
  t: /^\d{2}:\d{2}$/.test(r.t) ? r.t : "17:00",
  days: ["all", "wk", "we"].includes(r.days) ? r.days : "all",
  titles: r.titles && typeof r.titles === "object" ? Object.fromEntries(Object.entries(r.titles).slice(0, 7).map(([k, v]) => [k, String(v).slice(0, 40)])) : undefined,
}));

export default async function handler(req, res) {
  if (!kvReady()) return res.status(500).json({ code: "storage_missing" });
  const action = (req.query && req.query.a) || (req.body && req.body.action);

  try {
    if (action === "key") return res.status(200).json({ publicKey: (await vapid()).publicKey });

    if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
    if (!passOK(req)) return res.status(401).json({ code: "unauthorized" });
    const b = req.body || {};
    const sub = b.subscription;
    if (!sub || typeof sub.endpoint !== "string" || !sub.keys) return res.status(400).json({ code: "bad_subscription" });
    const id = idFor(sub.endpoint);

    if (action === "subscribe") {
      const rec = { sub, tz: String(b.tz || "America/Chicago").slice(0, 60), reminders: cleanReminders(b.reminders), at: Date.now() };
      await kv("SET", `sub:${id}`, JSON.stringify(rec));
      await kv("SADD", "subs", id);
      return res.status(200).json({ ok: true });
    }
    if (action === "unsubscribe") {
      await kv("DEL", `sub:${id}`);
      await kv("SREM", "subs", id);
      return res.status(200).json({ ok: true });
    }
    if (action === "test") {
      useVapid(await vapid());
      await webpush.sendNotification(sub, JSON.stringify({ title: "FitJourneyAI", body: "Reminders are on. You'll get these even when the app is closed." }));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ code: "bad_action" });
  } catch (e) {
    console.error("push error", e && (e.body || e.message || e));
    return res.status(500).json({ code: "push_error" });
  }
}

export { message };
