# LocalKart API

Base URL (production): `https://localkart-backend-cyz6.onrender.com/api`
Health: `GET /api/health` → `200 {"status":"ok","message":"LocalKart backend is running"}`

## Auth + CSRF

- Sessions are signed HttpOnly cookies. Log in once; the cookie authenticates later calls.
- Every mutating request (`POST`/`PUT`/`DELETE`) needs a CSRF token: first `GET /api/auth/csrf-token` → `{"token":"<64-hex>"}`, then send the same value as the `X-CSRF-Token` header (the endpoint also sets it as a cookie). `GET` requests need no token.
- Rate limits are process-local (`express-rate-limit`): auth mutations 30/15min per IP, login 10/15min, email-code requests 20/hour per IP plus 5/hour per email in the controller. Render Free runs a single instance, so a shared store is not needed today — if the backend ever scales past one instance, move the store to Redis first (see README).

## Errors

All errors are JSON `{ "message": "..." }`. Client errors are 400/403/404/409/429; server errors are 500 with the generic message `Something went wrong` — no stack trace is ever returned.

## Auth

### `POST /api/auth/register` — no auth, CSRF required
```json
// request
{ "name": "Rishabh Sharma", "email": "you@gla.ac.in", "password": "Password@123", "college": "GLA University" }
// 200 — a 6-digit code is emailed (10 min, 5 attempts, 5 sends/hour per email)
{ "message": "Verification code sent. Please check your email." }
// 400 — weak password / bad email / missing field; 503 — email not configured
```

### `POST /api/auth/verify-email` — no auth, CSRF required
```json
// request
{ "email": "you@gla.ac.in", "code": "123456" }
// 201 — account created, session cookie set
{ "message": "Email verified and account created successfully", "user": { "id": "...", "name": "Rishabh Sharma", "email": "you@gla.ac.in", "college": "GLA University" } }
// 400 — wrong/expired code; 429 — 5 wrong codes
```

### `POST /api/auth/login` — no auth, CSRF required
```json
// request
{ "email": "you@gla.ac.in", "password": "Password@123" }
// 200 — session cookie set
{ "message": "Login successful", "user": { "id": "...", "name": "Rishabh Sharma", "email": "you@gla.ac.in" } }
```

### `GET /api/auth/me` — auth required
```json
// 200
{ "id": "...", "name": "Rishabh Sharma", "email": "you@gla.ac.in", "college": "GLA University" }
```

### `POST /api/auth/logout` — auth, CSRF required → `200 {"message":"Logged out successfully"}`

### `POST /api/auth/forgot-password` — no auth, CSRF required
```json
// request
{ "email": "you@gla.ac.in" }
// 200 — code emailed only if the account exists (same message either way)
{ "message": "If an account exists for this email, a verification code has been sent." }
```

### `POST /api/auth/forgot-password/verify-otp` — no auth, CSRF required
```json
// request
{ "email": "you@gla.ac.in", "code": "123456" }
// 200
{ "message": "Email verified. Set your new password.", "resetToken": "<64-hex>" }
```

### `POST /api/auth/reset-password` — no auth, CSRF required
```json
// request
{ "email": "you@gla.ac.in", "resetToken": "<64-hex>", "password": "NewPass@123", "confirmPassword": "NewPass@123" }
// 200
{ "message": "Password reset successful. Please log in with your new password." }
```

## Products

### `GET /api/products` — public
Query params: `category`, `minPrice`, `maxPrice`, `search` (legacy) or `q`, `college`, `status=active|sold`, `page`, `limit` (1–100, default 20).

Without `page`/`limit`/`q` the response is a bare array (historic shape):
```json
[{ "_id": "...", "title": "Java Notes", "category": "Books", "price": 100, "condition": "Good", "status": "active", "isDemo": false, "images": ["https://res.cloudinary.com/..."], "seller": { "_id": "...", "name": "Rishabh Sharma", "college": "Gla university" }, "college": "GLA", "location": "Library" }]
```

With `page`/`limit`/`q` the response is paginated:
```json
// GET /api/products?page=2&limit=2&q=book
{ "products": [ { "_id": "...", "title": "Java Notes", "...": "..." } ], "total": 8, "page": 2, "limit": 2, "totalPages": 4 }
```

### `GET /api/products/:id` — public → `200` the product object, or `404 {"message":"Product not found"}` / `400 {"message":"Invalid product id"}`

### `POST /api/products` — auth, CSRF required, `multipart/form-data`, up to 5 `images`
```
title=Java Notes&description=Best notes&category=Books&price=100&condition=Good&location=Library
// 201
{ "message": "Product created successfully", "product": { "_id": "...", "title": "Java Notes", "...": "..." } }
```
Images: production path is Cloudinary (`localkart/products` folder) when `CLOUDINARY_*` is configured — every live listing photo is a `res.cloudinary.com` URL. Local `/uploads` is the fallback when Cloudinary is not configured (dev) and is served from the backend. Six early upload photos are committed under `backend/uploads/`; they are not referenced by live listings.

### `PUT /api/products/:id` — auth (seller only), CSRF required
```json
// request — any of title, description, category, price, condition, location, status
{ "price": 90 }
// 200
{ "message": "Product updated successfully", "product": { "...": "..." } }
```

### `DELETE /api/products/:id` — auth (seller only), CSRF required → `200 {"message":"Product deleted successfully"}`

### `GET /api/products/mine` — auth → `200` array of the caller's listings

### `POST /api/products/:id/purchase` — auth (buyer), CSRF required
The buyer must have messaged the seller about this item first. Atomic: only one pending request wins; a second buyer gets `409`.
```json
// 200
{ "message": "Purchase request sent. The listing will remain available until the seller confirms the sale.", "product": { "...": "..." } }
// 409
{ "message": "A purchase request is already pending or this item is no longer available" }
```

### `POST /api/products/:id/confirm-sale` — auth (seller only), CSRF required
```json
// 200
{ "message": "Sale confirmed. The listing is now sold.", "product": { "status": "sold", "...": "..." } }
// 409 — no pending request
{ "message": "There is no pending purchase request for this listing" }
```

## Messages

### `POST /api/messages` — auth, CSRF required
```json
// request
{ "receiver": "<user id>", "product": "<product id>", "content": "Hi, is this still available?" }
// 201
{ "message": "Message sent successfully", "data": { "_id": "...", "sender": "...", "receiver": "...", "product": "...", "content": "Hi, is this still available?" } }
```

### `GET /api/messages?product=<id>` — auth → `200` array of the caller's messages (optionally filtered to one product)

## Reviews

### `POST /api/reviews` — auth, CSRF required
```json
// request
{ "reviewedUser": "<user id>", "product": "<product id>", "rating": 5, "comment": "Smooth handover." }
// 201
{ "message": "Review added successfully", "review": { "...": "..." }, "averageRating": 5 }
```

### `GET /api/reviews/user/:userId` — public → `200` array of reviews for that user

## AI (optional, Gemini)

### `POST /api/ai/suggest-price` — public
```json
// request
{ "title": "Java Notes", "category": "Books", "condition": "Good", "price": 100 }
// 200
{ "suggestedPrice": 120, "marketRange": "₹80–₹150", "reason": "..." }
```
