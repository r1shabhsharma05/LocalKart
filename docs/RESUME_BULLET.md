# LocalKart — resume bullet (measured numbers only, 2026-11-17)

> Built LocalKart, a campus marketplace (React + Node/Express + MongoDB Atlas) with HttpOnly cookie sessions, CSRF and email-OTP auth; 8 real listings across 4 categories; 20 backend + 16 frontend tests passing, Playwright E2E green, Lighthouse 83 performance / 100 accessibility.

## What each number rests on

- **8 real listings, 4 categories** — live `GET /api/products`, 2026-11-17: Java Notes ₹100, Python Book ₹200, Asus Laptop ₹65,000, MacBook ₹75,000, Hoodie ₹700, Black T-Shirt ₹450, Apple HeadPhones ₹1,200, EarBuds ₹500; all `isDemo: false`, categories Books / Laptops / Clothes / Electronics.
- **20 backend + 16 frontend tests** — `npm --prefix backend test` (Vitest + Supertest + in-memory MongoDB) and `npm --prefix frontend test` (Vitest), both green 2026-11-17.
- **Playwright E2E green** — 2/2 locally against a production-mode server (public flow + 390px no-overflow check). CI runs the same spec against the live site.
- **Lighthouse 83 / 100** — local production build, 1 seeded listing, 2026-11-17 (Performance 83, Accessibility 100, Best Practices 96, SEO 92). Quote as local numbers until a live-site run is done.

## Do NOT claim (not measured or not true)

- CI green — CI is configured; its first run happens on the next push.
- Uptime % / API p95 / registered-user count — not measured.
- Redis, TypeScript, payments (Razorpay), Postgres — not in this repo.
- Solo work — Shivam Rajput is the main contributor (see README "What I built").
