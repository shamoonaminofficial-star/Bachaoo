# Bachatly — API Architecture (NestJS REST, `/api/v1/`)

## 1. Base Conventions

- **Base URL**: `https://api.bachatly.com/api/v1/` (web apps call same-origin `/api/v1/` via BFF/proxy; mobile uses the API host).
- **Versioning**: URI versioning (`/api/v1/`); breaking changes → `/api/v2/` with 12-month deprecation window.
- **Auth**: `Authorization: Bearer <accessToken>` (JWT, 15-min expiry) + httpOnly `refreshToken` cookie (30-day, rotation). Every refresh revokes the old token (stored hashed in `Session`).
- **OTP-ready**: `/auth/otp/request` + `/auth/otp/verify` endpoints exist behind a feature flag; phone login and step-up auth (sensitive actions) can require OTP without API shape changes.
- **Content**: JSON in/out; UTF-8; times in ISO-8601 UTC; money as **integer paisa** in requests/responses (never floats).
- **Idempotency**: `Idempotency-Key` header supported on POST `/payments`, `/redemptions/confirm`, `/wallet/adjust`.

## 2. Modules & Key Endpoints

| Module | Representative endpoints |
|---|---|
| `auth` | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/verify-email`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `GET /auth/me`, `POST /auth/oauth/:provider` (Google/Apple-ready) |
| `users` | `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /users/:id/suspend`, `POST /users/:id/reactivate`, `GET /users/:id/activity` |
| `businesses` | `GET /businesses`, `POST /businesses` (admin), `GET /businesses/:slug`, `PATCH /businesses/:id`, `POST /businesses/:id/verify`, `POST /businesses/:id/suspend`, `POST /businesses/:id/reactivate`, `GET /businesses/:id/analytics` |
| `branches` | `GET /businesses/:id/branches`, `POST /businesses/:id/branches`, `PATCH /branches/:id`, `DELETE /branches/:id` |
| `categories` | `GET /categories` (tree), `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id`, `POST /categories/reorder`; subcategories nested |
| `deals` | `GET /deals` (search/filter/sort), `GET /deals/:slug`, `POST /deals`, `PATCH /deals/:id`, `POST /deals/:id/duplicate`, `POST /deals/:id/submit`, `POST /deals/:id/approve`, `POST /deals/:id/reject`, `POST /deals/:id/pause`, `POST /deals/:id/publish` |
| `memberships` | `GET /membership-plans`, `POST /membership-plans` (admin), `PATCH /membership-plans/:id`, `POST /memberships/purchase`, `GET /memberships/me`, `POST /memberships/:id/extend`, `POST /memberships/:id/cancel`, `POST /memberships/:id/assign` (admin) |
| `vouchers` | `GET /vouchers`, `POST /vouchers`, `GET /vouchers/me`, `POST /vouchers/:id/claim`, `POST /vouchers/redeem` |
| `redemptions` | `POST /redemptions/qr` (issue signed token), `POST /redemptions/validate` (scanner), `POST /redemptions/confirm` (server computes bill math), `POST /redemptions/:id/void`, `GET /redemptions` (history, scoped) |
| `rewards` | `GET /rewards/me`, `GET /rewards/me/transactions`, `POST /rewards/redeem` (marketplace exchange), `POST /rewards/adjust` (admin) |
| `wallet` | `GET /wallet/me`, `GET /wallet/me/transactions`, `POST /wallet/adjust` (admin) |
| `cashback` | `GET /cashback/me`, `GET /cashback/me/transactions`, `POST /cashback/:id/approve`, `POST /cashback/:id/reject`, `POST /cashback/redeem` |
| `referrals` | `GET /referrals/me` (code, URL, stats), `POST /referrals/apply-code`, `GET /referrals` (admin) |
| `payments` | `POST /payments/initiate`, `POST /payments/webhook/:gateway` (signature-verified), `GET /payments`, `GET /payments/:id`, `POST /payments/:id/verify` (manual receipts), `POST /payments/:id/refund`, `POST /payments/:id/receipt` (upload) |
| `reviews` | `GET /businesses/:id/reviews`, `POST /reviews`, `PATCH /reviews/:id`, `POST /reviews/:id/moderate` |
| `notifications` | `GET /notifications/me`, `PATCH /notifications/:id/read`, `POST /notifications/preferences`, `POST /campaigns`, `POST /campaigns/:id/send` |
| `reports` | `GET /reports/:type` (membership-sales, payments, redemptions, savings, business-performance, rewards, cashback, referrals, commissions, settlements) with `?format=csv` |
| `analytics` | `GET /analytics/overview`, `/analytics/customer`, `/analytics/business/:id`, `/analytics/platform` |
| `cms` | `GET /cms/:slug` (public), `PUT /cms/:slug` (admin), `GET /banners?placement=`, `POST /banners` (admin) |
| `support` | `POST /support/tickets`, `GET /support/tickets`, `GET /support/tickets/:id`, `POST /support/tickets/:id/messages`, `PATCH /support/tickets/:id` |
| `admin` | `GET /admin/dashboard`, `GET /admin/applications`, `POST /admin/applications/:id/decision`, `GET /admin/audit-logs`, `GET /admin/settings`, `PUT /admin/settings`, `GET /admin/staff`, `GET /admin/roles` |

## 3. Pagination / Search / Filter / Sort

- Pagination: `?page=1&limit=20` → `{ data: [...], meta: { page, limit, total, totalPages } }`. Cursor pagination for high-volume feeds (`?cursor=&limit=`).
- Search: `?q=` full-text (deals, businesses, categories; trigram/FTS index).
- Filters: `?category=&city=&minDiscount=&maxPrice=&rating=&status=&from=&to=` (whitelisted per endpoint).
- Sort: `?sort=newest|discount|popular|ending|nearest|priceAsc|priceDesc` mapped server-side to whitelisted columns — never raw column names.

## 4. Validation & Error Format

- Server-side DTO validation (class-validator): all inputs validated; **never trust frontend calculations** — bill, discount, saving, cashback, points are recomputed server-side and snapshotted.
- Consistent error envelope:
  `{ "success": false, "error": { "code": "DEAL_NOT_ELIGIBLE", "message": "Membership required to redeem this deal.", "details": { "requiredPlan": "premium" } }, "meta": { "requestId": "..." } }`
- HTTP mapping: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict (duplicate redemption), 410 QR expired, 422 business rule, 429 rate limited, 500 internal (generic message only).

## 5. Rate Limiting & Security

- Global: 100 req/min per IP; auth endpoints 10/min; OTP 5/min; QR issue 30/min; webhook endpoints signature-checked, IP-allowlisted where possible.
- Brute-force: progressive lockout on login; security headers (helmet); CSRF for cookie flows; input sanitization (XSS); parameterized queries (Prisma); file/image validation (type, size, dimensions, virus-scan hook).
- Secrets only via env (`JWT_SECRET`, `JWT_REFRESH_SECRET`, gateway keys, S3, Google Maps) — never in responses or frontend bundles.

## 6. QR Signed Short-Lived Token Scheme

1. `POST /redemptions/qr` (after eligibility checks) → server creates token: `payload = { jti, sub: userRef, dealRef, branchRef, iat, exp }`, `exp = now + 90s` (configurable 60–120s).
2. Token = JWS signed with `QR_SIGNING_SECRET` (rotated); payload contains **opaque references only** — no user ID, deal ID, membership ID, no PII.
3. QR auto-refreshes client-side before expiry.
4. `POST /redemptions/validate` (scanner): verifies signature → checks `exp` → checks `jti` not already used (Redis `SETNX` with TTL) → checks deal/business/branch still active → returns display data (customer first name, membership status, deal, discount).
5. `POST /redemptions/confirm` (bill amount in paisa): **server recomputes** discount (percent, max cap), final bill, saving, cashback, points; writes `Redemption` + `SavingsTransaction` + ledger rows in one DB transaction with `idempotencyKey`.
6. Replay prevention: `jti` single-use (Redis + DB unique constraint); screenshot reuse → `410` + fraud flag; repeated attempts → admin fraud review.

## 7. Payments Architecture (modular gateways)

- `PaymentGateway` interface: `initiate()`, `verifyCallback()`, `refund()` — implementations: `CardGateway`, `StripeGateway` (ready), `BankTransferGateway` (manual receipt), `ManualGateway`.
- Gateway selection per `SystemSetting`; credentials from env only; **all callbacks verified server-side** (signature/HMAC) before marking `Paid`.
- Never store card numbers/CVV; store only gateway transaction IDs and redacted payloads in `PaymentAttempt`.

## 8. Logging & Observability

- Request ID on every request; structured JSON logs; audit logging for sensitive actions (separate `AuditLog` table); metrics endpoint for dashboards; webhook delivery retries with backoff.
