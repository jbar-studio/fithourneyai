# FitJourneyAI

Personal training app: weekly schedule, daily workout checklist, diet & care checklist with a food log, progress tracking (maxes, weight), and an AI Coach with nutrition-label scanning.

- `index.html`: the whole app. Data saves on the phone (localStorage).
- `api/coach.js`: Coach chat route (calls Anthropic).
- `api/scan.js`: nutrition label scanning route (calls Anthropic).
- `api/_shared.js`: passcode check, rate limit, Anthropic call.

## Deploy on Vercel

1. Push this folder to a new GitHub repo (e.g. `fitjourneyai`).
2. In Vercel: **Add New → Project**, import the repo. Framework preset: **Other**. No build command needed.
3. **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com (account and billing set up by a parent).
   - `APP_PASSCODE`: any passcode you choose. Coach and scanning only work for people who enter it, so strangers can't run up the bill.
4. Redeploy so the variables take effect.
5. **Settings → Domains**, add `fitjourneyai.jbar.studio`. Vercel shows a CNAME record (`cname.vercel-dns.com`). Add it wherever jbar.studio's DNS is managed. If jbar.studio's DNS is already on Vercel, it's added automatically.
6. On your phone, open `https://fitjourneyai.jbar.studio`, go to **Coach**, enter the passcode, then **Add to Home Screen**.

## Keep costs safe

- In the Anthropic console, set a monthly **spend limit** (e.g. $5).
- Coach replies are capped at about 600 tokens and the routes allow 12 requests per minute per visitor.

## Notes

- Data lives on the device. Clearing browser data or switching phones starts fresh.
- The Coach's safety rules live in `api/coach.js` on the server.
