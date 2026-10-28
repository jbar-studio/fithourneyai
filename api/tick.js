import webpush from "web-push";
import { kv, kvReady, message } from "./_kv.js";
import { vapid, useVapid } from "./push.js";

// Called every ~10 minutes by the GitHub timer (.github/workflows/reminders.yml).
// Sends each reminder once per day, any time in the 45 minutes after its set time
// (the timer can run a little late). Safe to call often: nothing is sent twice.
const WINDOW_MIN = 45;

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const mins = (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, dow, mins };
}

export default async function handler(req, res) {
  if (!kvReady()) return res.status(500).json({ code: "storage_missing" });
  try {
    const ids = (await kv("SMEMBERS", "subs")) || [];
    if (!ids.length) return res.status(200).json({ sent: 0, subs: 0 });
    useVapid(await vapid());
    let sent = 0;
    for (const id of ids) {
      const raw = await kv("GET", `sub:${id}`);
      if (!raw) { await kv("SREM", "subs", id); continue; }
      const rec = JSON.parse(raw);
      let now;
      try { now = localNow(rec.tz); } catch { now = localNow("America/Chicago"); }
      for (const r of rec.reminders || []) {
        if (!r.on) continue;
        const weekday = now.dow >= 1 && now.dow <= 5;
        if (r.days === "wk" && !weekday) continue;
        if (r.days === "we" && weekday) continue;
        const [h, m] = r.t.split(":").map(Number);
        const due = h * 60 + m;
        if (now.mins < due || now.mins > due + WINDOW_MIN) continue;
        const first = await kv("SET", `sent:${id}:${r.id}:${now.date}`, "1", "NX", "EX", "172800");
        if (first !== "OK") continue;
        try {
          await webpush.sendNotification(rec.sub, JSON.stringify(message(r, now.dow)), { TTL: 3600, urgency: "high" });
          sent++;
        } catch (e) {
          console.error("send failed", e.statusCode, e.body);
          if (e.statusCode === 404 || e.statusCode === 410) { await kv("DEL", `sub:${id}`); await kv("SREM", "subs", id); break; }
        }
      }
    }
    return res.status(200).json({ sent, subs: ids.length });
  } catch (e) {
    console.error("tick error", e && (e.message || e));
    return res.status(500).json({ code: "tick_error" });
  }
}
