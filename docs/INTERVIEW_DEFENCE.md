# LocalKart — Interview Defence Sheet

Prepared 2026-11-17 from the real code in this repo (not from memory).
Every claim below names the file it rests on. If the code changes, this
sheet goes stale — re-check before an interview.

## 30-second pitch

"LocalKart is a campus marketplace for GLA students — buy and sell used
items within your own university, meet on campus, pay in person. React
frontend on Vercel, Node/Express API on Render, MongoDB Atlas. Login is
email-OTP plus HttpOnly cookie sessions with CSRF. I built the Atlas
connection and deployment, the email-delivery path, and the 2026-11-17
flagship pass: backend tests, pagination, CI, and the loading state."

## 2-minute walkthrough (file by file)

1. Browser loads the React 18 + Vite app from Vercel (`frontend/src/App.jsx`,
   routes in `App.jsx`, pages in `frontend/src/pages/`).
2. `HomePage.jsx` calls `GET /api/products` via `frontend/src/api/axios.js`.
   While the Render backend wakes (~50s on the free plan) it shows skeleton
   cards and a "Waking up the backend" note — never "0 items".
3. The API is `backend/app.js` (Express): Helmet, CORS allow-list from
   `FRONTEND_URL`, `express.json`, then `verifyCsrfToken` on all of `/api`,
   then the routers (`backend/routes/`).
4. Auth (`backend/routes/authRoutes.js` → `controllers/authController.js`):
   register → 6-digit code by email (Brevo HTTP API, 10 min, 5 attempts,
   5 sends/hour/email) → verify → account created, session cookie set.
   Sessions are signed JWTs in HttpOnly cookies (`backend/utils/cookies.js`,
   `generateToken.js`); the JWT never touches `localStorage`.
5. Products (`controllers/productController.js`): list with category /
   price / search filters and pagination (`?page=&limit=&q=`, total count);
   create with up to 5 photos via multer → Cloudinary
   (`localkart/products` folder) when `CLOUDINARY_*` is set, local
   `/uploads` fallback otherwise.
6. Sale flow: buyer messages seller (`controllers/messageController.js`) →
   `POST /api/products/:id/purchase` → seller confirms →
   `POST /api/products/:id/confirm-sale` → status `sold`.
7. Data lives in MongoDB Atlas M0, ap-south-1 Mumbai (`backend/config/db.js`,
   Mongoose models in `backend/models/`).

```
Browser (Vercel static React)
   │  HTTPS, VITE_API_URL
   ▼
Render (Node/Express, backend/app.js)
   │  Helmet CSP · CORS allow-list · CSRF on /api · rate limits
   ├─ /api/auth     → authController (OTP via Brevo, bcrypt, JWT cookie)
   ├─ /api/products → productController (multer → Cloudinary, sale flow)
   ├─ /api/messages → messageController (buyer–seller chat)
   ├─ /api/reviews  → reviewController
   └─ /api/ai       → aiController (Gemini fair-price suggestion)
   │  Mongoose
   ▼
MongoDB Atlas M0 (ap-south-1, Mumbai)
```

## My part vs Shivam's part (from `git log`, 57 commits)

- **Rishabh Sharma — 39 commits.** Atlas connection + deployment (PRs #2/#3,
  `feat/atlas-connect-run`), Render + Vercel setup, SPA fallback rewrites,
  OTP email delivery (Gmail SMTP → Resend → Brevo HTTP API), `SameSite=None`
  cross-origin cookies, email-code rate-limit raise (5 → 20/hour per IP,
  campus NAT), neon login/OTP UI, listing-photo crop-to-frame, and the
  2026-11-17 flagship pass (20 backend tests, pagination + search, shared
  error handler, CI, waking-up state, `API.md`, this sheet).
- **Shivam Rajput — 16 commits, main contributor.** Cookie sessions + CSRF,
  demo listings (120) + demo sellers, theme/nav refresh, security
  hardening, category rails, fallback images.
- **Aman Kumar — 2 commits.** Original repo this was forked from.

Say exactly this in interviews. Do not claim the whole repo as solo work.

## Hard questions — with strong answers

### 1. Why MongoDB and not Postgres?

"Listings are documents, not rows with joins: a product has a title,
description, category, price, images array, seller ref, and a sale state
that changes over time. The only 'join' is `populate('seller', 'name
college')` — one lookup, no multi-table queries. MongoDB's flexible
schema let categories and listing fields evolve without migrations, and
Atlas M0 was free with zero ops. If this grew into orders, payments, and
refunds with real transactions, I'd move the money parts to Postgres —
MongoDB was the right call for a read-heavy catalogue, not a claim that
it's right for everything."

Honest weakness to own: there are no custom indexes on the models
(`backend/models/` defines none beyond the unique email) — at 100k
listings the category + status filter would collection-scan. Fix: compound
index `{ status: 1, category: 1, createdAt: -1 }`.

### 2. Two buyers request the same item at once — what breaks?

"Nothing breaks, by design. `requestPurchase`
(`controllers/productController.js`) does an atomic
`findOneAndUpdate({ _id, status: 'active', purchaseRequestedBy: null },
{ $set: { purchaseRequestedBy: buyer } })`. Only the first update matches;
the second gets `null` back and a `409` — 'A purchase request is already
pending'. `confirmSale` uses the same guard (`status: 'active',
purchaseRequestedBy: buyerId`), so a stale confirm also 409s. The one
gap: the buyer must have messaged the seller first, and the message-send
and the request are two separate calls — a buyer can message and then the
item can sell to someone else before they request. That's a UX race, not
a data race: the request still 409s cleanly."

### 3. The Render backend sleeps — how do you fix it properly?

"The free plan sleeps after ~15 minutes idle; first request takes ~50s.
Three options, honestly ranked: (1) paid Render plan — ~$7/month, the
instance never sleeps; correct and boring, and what I'd do for real
users. (2) A keep-alive ping every few minutes — it works, but it burns
free-tier hours to dodge the free tier's own limit, and Render can still
restart the instance. (3) Move the API somewhere always-on — a cheap VPS
or Fly.io — more ops work for the same result as (1). What I did now is
mitigation, not a fix: the frontend shows a waking-up state with skeleton
cards instead of '0 items', so a cold visitor waits once instead of
bouncing. The proper fix is (1)."

## One incident: cold-start empty listings

"First load showed '0 items' and 'Loading products...' for ~50 seconds
while Render woke up — a recruiter opening it once saw an empty shop.
Root cause wasn't the data (8 real listings were live); it was the UI
treating 'not loaded yet' as 'empty'. Fix, 2026-11-17: a skeleton grid in
the card footprint plus 'Waking up the backend — the free plan takes
~30–50s on first load' and the item count hidden until data arrives
(`frontend/src/pages/HomePage.jsx`, `MarketplaceImage.jsx` lazy-load,
`HomePage.test.jsx` pins it). What next: the paid Render plan, so the
waking state is rarely seen at all."

## More questions an interviewer will ask

- **"How do you know it works?"** — `npm --prefix backend test`: 20 tests
  (auth incl. wrong-OTP lockout, products incl. pagination + sell flow,
  messages, error handling) against a real Express app + in-memory MongoDB;
  `npm --prefix frontend test`: 16 tests; Playwright E2E 2/2 (public flow
  + 390px no-overflow); CI runs all three on every push.
- **"Where does auth sit?"** — `verifyCsrfToken` (`middleware/csrfMiddleware.js`)
  on all of `/api` for mutations; `protect` (`middleware/authMiddleware.js`)
  on authed routes; rate limits in `routes/authRoutes.js`.
- **"What if a token is stolen?"** — session JWT is HttpOnly, so page JS
  can't read it; `authVersion` on the user lets a password reset invalidate
  old sessions. There is no token revocation list — a stolen cookie works
  until the JWT expires or the password is reset. Own that.
- **"Why no payments?"** — by design. Campus meet-and-pay-in-person;
  Razorpay belongs to SecureGaurd/Farmer, not this repo. Do not claim it.
- **"What breaks at 10k users?"** — process-local rate-limit store (one
  Render instance today, documented in `API.md`); no Redis cache; no
  pagination was true until 2026-11-17 (now `?page=&limit=` with total).
  Next: Redis (Upstash free) for the product list + a shared rate-limit
  store before a second instance.
- **"Hardest bug?"** — OTP mail: Gmail SMTP timed out on every Render
  port, Resend's testing mode 403'd every non-owner recipient, Brevo HTTP
  finally delivered. Each failure was verified live, not guessed.
- **"What would you change rebuilding today?"** — TypeScript from day one
  (this repo is JavaScript — do not claim TS for it), cursor pagination,
  and one error-handling middleware from the start (added 2026-11-17; it
  also fixed a real bug where invalid JSON returned 500 instead of 400).

## Fix before the interview

1. Add the compound index `{ status: 1, category: 1, createdAt: -1 }` on
   products (`backend/models/Product.js`).
2. Seed 2+ more real listings so the live count is 10+ across 5+
   categories (needs Rishabh's GLA sellers/photos — not a code task).
3. Run CI once after pushing and Lighthouse once on the live site; until
   then say "CI configured, first run pending" and quote the local
   Lighthouse numbers (83 / 100 / 96 / 92) as local, not live.

## Measured numbers only (2026-11-17)

- 8 real listings, 4 categories, all `isDemo: false` (live `/api/products`)
- 20 backend + 16 frontend tests passing; Playwright E2E 2/2 green (local)
- Lighthouse, local production build: Performance 83, Accessibility 100,
  Best Practices 96, SEO 92
- Uptime %, registered-user count, API p95: NOT measured — do not quote them
