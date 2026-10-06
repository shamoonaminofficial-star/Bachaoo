# Bachatly — Customer Web App (`apps/web`)

Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS frontend for the
Bachatly deals / discounts / membership marketplace. Pakistan-first, multi-country ready.

## Structure

```
app/
  (public)/        Public site: home, deals, deal/[slug], businesses, business/[slug],
                  categories, category/[slug], membership (+ checkout), rewards,
                  partner (landing + application), nearby, search, CMS pages
  (auth)/          login, register, forgot-password, reset-password, verify-otp, verify-email
  (account)/       Customer dashboard: overview, membership, qr, saved, vouchers,
                  rewards, wallet, cashback, referrals, history, savings,
                  notifications, profile, security, support
  (partner)/       Partner portal: dashboard, scanner, deals, vouchers, redemptions,
                  customers, branches, staff, reviews, analytics, settlements,
                  profile, notifications, support, settings
  (admin)/         Super admin: dashboard, users, businesses, applications, branches,
                  categories, deals, vouchers, plans, memberships, redemptions,
                  rewards, wallet, cashback, referrals, payments, commissions,
                  settlements, reviews, notifications, campaigns, banners, cms,
                  reports, analytics, support, staff, roles, audit, settings
  layout.tsx       Root layout (metadata, OG/Twitter, toast provider)
  not-found.tsx / error.tsx / maintenance / offline / sitemap.ts / robots.ts
lib/
  api.ts           Typed fetch client → ${NEXT_PUBLIC_API_URL}/api/v1 (Bearer token,
                  401 single-flight refresh + retry, consistent ApiError)
  apiForm / validateUploadFile in api.ts: multipart POST + client-side file validation
  catalog.ts       Phase 3 typed catalog layer (locations/categories/businesses/branches)
  auth.tsx         AuthProvider: user/roles/permissions, login/register/logout,
                  silent refresh, role-aware dashboard routing
  auth-client.ts   Framework-free in-memory access token + single-flight refresh
  format.ts        PKR formatting ("Rs. 5,000"), Asia/Karachi dates, distances
  seed.ts          DEV-ONLY seed data — used only when the API is unreachable
app/api/auth/      Next.js session routes (server-side): login, register, refresh,
                  logout, me — own the httpOnly cookies, proxy to the backend
components/
  AuthGuard.tsx    Client gate for dashboard layouts (skeleton → login / 403)
middleware.ts      Edge route guards: jose JWT verification + silent refresh +
                  role gates for /account, /partner/dashboard, /admin
app/403/           Friendly "Not authorized" page
```

Shared components + design tokens live in `packages/ui` (`theme.ts` is the single
source of truth for brand colors).

## Setup

```bash
# from repo root
cp apps/web/.env.example apps/web/.env.local
# edit NEXT_PUBLIC_API_URL to point at the backend (default http://localhost:4000)

npm install
npm run dev --workspace @bachatly/web   # → http://localhost:3000
```

Or with pnpm workspaces: `pnpm --filter @bachatly/web dev`.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (metadata, sitemap, share links) |
| `NEXT_PUBLIC_API_URL` | Backend base URL (client calls `${...}/api/v1`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps embeds (optional; placeholders render without it) |
| `JWT_SECRET` | **Required.** Must match the backend API's `JWT_SECRET` — the edge middleware verifies the access-token signature with `jose`. Missing in production = hard error. |
| `API_URL_INTERNAL` | Optional server-side backend URL (e.g. `http://api:4000` in Docker); defaults to `NEXT_PUBLIC_API_URL` |

## Authentication

**Token-handling contract** (implemented; cross-check with the backend):

| Token | Lifetime | Where it lives | How refresh works |
|---|---|---|---|
| Access JWT | 15 min | **In memory only** (client JS variable). Also mirrored into an httpOnly `bachatly_at` cookie (Path=/) so the edge middleware can verify it. Sent as `Authorization: Bearer` on API calls. | Silent refresh scheduled ~2 min before expiry; on any 401 the API client does a **single-flight** refresh and retries once. |
| Refresh JWT | 30 days, rotated | **httpOnly `bachatly_rt` cookie** (Path=/api/auth, Secure in prod, SameSite=Lax). Set/read only by the Next.js `/api/auth/*` route handlers — client JavaScript never sees it. | `POST /api/auth/refresh` reads the cookie, calls backend `/auth/refresh` (which rotates the session row), and re-sets both cookies. |
| Roles | 15 min | httpOnly `bachatly_roles` cookie (JSON array), set server-side at login/refresh. | Refreshed together with the tokens. |

**Session routes** (`app/api/auth/`): `login`, `register`, `refresh`, `logout`, `me`.
They proxy to the NestJS backend (`${API_URL_INTERNAL}/api/v1/auth/...`) and own
the cookies. The browser client only ever handles the short-lived access token.

**Middleware** (`middleware.ts`): verifies the access-token signature + expiry with
`jose` (HS256). Missing/invalid → one silent-refresh attempt via the refresh
cookie → else redirect `/login?next=<path>`. Role gates read the `roles` claim
from the verified JWT when present, else the server-set `bachatly_roles` cookie:
`/account/*` any authenticated user; `/partner/dashboard/*` business roles
(`BUSINESS_OWNER`, `BUSINESS_MANAGER`, `CASHIER`, `SCANNER`); `/admin/*` admin
roles (`SUPER_ADMIN`, `ADMINISTRATOR`, `ADMIN`, `SUPPORT_AGENT`,
`CONTENT_MANAGER`, `FINANCE_MANAGER`, `MARKETING_MANAGER`). Wrong role → `/403`.

**AuthProvider** (`lib/auth.tsx`): `user`, `roles`, `permissions`, `isLoading`,
`login()`, `register()`, `logout()`, `refresh()`. After login the user lands on
`?next=` when present, otherwise the role-appropriate dashboard
(`dashboardForRoles()`). Dashboard layouts wrap content in `<AuthGuard>` which
shows a skeleton while the session resolves.

**Roles (authoritative):** the backend's `GET /auth/me` returns `roles: string[]`
and `permissions: string[]`. The session routes (`login`, `register`, `refresh`)
call `/auth/me` with the fresh access token and store the real roles in the
`bachatly_roles` cookie — the DEV-ONLY seed-account mapping
(`admin@bachatly.pk` → `SUPER_ADMIN`, `owner@*.pk` → `BUSINESS_OWNER`, else
`CUSTOMER`) is now only a last-resort fallback if `/me` is unreachable, and it
never runs in production. Data-level authorization is enforced by the backend's
per-request role loading regardless.

**Auth pages:** login (email-or-phone), register (zod validation via
`@bachatly/validation`, city select from `GET /api/v1/cities` with seed
fallback, optional referral code, phone normalized to `03XXXXXXXXX`),
forgot/reset password (honest "not available yet" state — the backend
endpoints are not implemented; no fake success), OTP verify
(`POST /auth/otp/request` + `POST /auth/otp/verify`), email verify
(`POST /auth/verify-email`). No mock logins anywhere — failures surface real
API error codes (`INVALID_CREDENTIALS`, `EMAIL_OR_PHONE_TAKEN`,
`OTP_INVALID`, `OTP_EXPIRED`, …).

Server secrets (payment gateway keys, SMTP, S3) live **only** in the backend —
never add them here.

## Deals (Phase 4)

`lib/catalog.ts` gained a deals section over the `/api/v1` contract. Backend
money arrives in **paisa**; `paisaToPkr()` normalizes to whole PKR for the UI
`Deal` type, and `mapDeal()` maps nested backend shapes (business/category
objects, `requiresMembership`, `endsAt`) to the card shape.

- **Public:** `GET /deals` (q, categoryId, subcategoryId, cityId, areaId,
  businessId, minDiscount, dealType, maxPrice, ratingMin, membershipRequired,
  availableNow, sort ∈ recommended|nearby|newest|discount|popular|ending,
  lat/lng/radiusKm, page/pageSize), `GET /deals/:slug` (detail with `computed`
  eligibility + `youSavePaisa`).
- **Search:** `GET /search?q=` (deals/businesses/categories),
  `GET /search/suggest?q=` (autocomplete; header uses it with debounce +
  localStorage recent searches).
- **Favorites:** `GET /favorites?type=`, `POST /favorites`
  `{ targetType, targetId }`, `DELETE /favorites/:id`.
- **Partner:** `GET /deals/mine?status=`, `POST /deals` (multipart `images[]`),
  `PATCH /deals/:id`, `POST /deals/:id/duplicate|submit|pause|resume`,
  `DELETE /deals/:id`.
- **Admin:** `GET /deals/admin/queue?status=`,
  `POST /deals/:id/approve|reject|request-changes` (reason required except
  approve; stored with reviewer + timestamp).

`/deal/[slug]` shows **“You Save Rs. X”** only when `youSavePaisa` is present.
Redeem Offer gates: logged out → login; `requiresMembership` without an active
membership → `/membership?next=…` with an explainer toast. Actual QR minting
lands in Phase 6 — the page never fakes a redemption flow.

## Memberships & Payments (Phase 5)

`lib/memberships.ts` is the typed layer over the `/api/v1` memberships/payments
contract. Money arrives in **paisa** and is normalized to whole PKR with
`paisaToPkr()`; everything is displayed as `Rs. X`.

- **Public:** `GET /memberships/plans` (active plans → `/membership` page with
  featured highlight, sale vs regular price, duration, benefits; shows an
  "already a member" state via `GET /memberships/me` when logged in).
- **Checkout:** `/membership/checkout/[planId]` (login-required; legacy
  `?plan=` route redirects). `POST /memberships/purchase { planId, gateway }`.
  `manual` (bank transfer) is fully working: bank accounts + reference from
  `clientData`, receipt upload via `POST /memberships/manual-receipt/:paymentId`
  (multipart `receipt`) → pending-verification state. JazzCash / Easypaisa /
  Card are shown as honest **"coming soon"** disabled states — no fake payment
  is ever simulated.
- **Customer:** `/account/membership` — `GET /memberships/me` (active card with
  days-remaining progress bar), `GET /memberships/history`, renew/upgrade →
  `/membership`, cancel via `POST /memberships/me/cancel` with reason.
- **Admin plans:** `GET /memberships/plans/admin`, `POST/PATCH/DELETE
  /memberships/plans/:id` (paisa conversion in `planFormToBody`), toggle via
  PATCH `{ isActive }`, delete guarded (in-use messaging).
- **Admin memberships:** `GET /memberships/admin?status&q&page&pageSize`,
  `POST /memberships/admin/assign`, `POST /memberships/:id/extend|cancel`
  (reason required, audit-logged).
- **Admin payments:** `GET /payments/admin?status&gateway&q&page&pageSize`,
  manual-verification queue with `POST /payments/:id/approve|reject` (reason
  required to reject), payment detail drawer.

## Redemption & Savings (Phase 6)

`lib/catalog.ts` gained a **redemptions section** over the `/api/v1` contract.
Money arrives in **paisa** and is normalized to whole PKR with
`paisaToPkr()` / displayed with `formatPaisa()`:

- `POST /redemptions/qr { dealId, branchId? }` → `{ token, expiresIn }`
  (short-lived signed JWT, ~90s; falls back to the early-draft
  `/redemptions/qr-token` path on 404).
- `POST /redemptions/validate { token }` → customer first name, membership
  status/plan, deal + discount rules, branch.
- `POST /redemptions/confirm { token, billAmountPaisa }` → server-computed
  receipt `{ redemptionId, bill, discount, paid, saving, cashback, points }`.
- `GET /redemptions/history?page&pageSize`, `GET /redemptions/savings/summary`
  (`{ total, thisMonth, thisYear, byCategory, byMonth }` — paisa),
  `GET /redemptions/deal/:id/eligibility` → `{ eligible, reasons[] }`,
  `GET /redemptions/admin?q&status&...` (admin list).

Pages/components:

- **`/deal/[slug]`** — "Redeem Offer" now opens `RedeemQrModal`
  (`components/RedeemQrModal.tsx`): eligibility check → branch picker (when
  multiple branches) → mint token → QR with **live countdown bar** and
  **auto-refresh ~10s before expiry while the modal is open** (stops on close).
  Ineligible users see the server's reasons + a membership upsell.
- **`components/QrCode.tsx`** — placeholder QR renderer: deterministic
  pseudo-QR pattern + raw token as text, clearly badged "Demo pattern — not
  scannable". No QR library is in `package.json` and `npm install` was out of
  scope; the file documents the one-line swap (`react-qr-code`) to go live.
- **`/account/qr`** — real membership data (`GET /memberships/me`) in the
  digital card, a note that deal-specific QRs are minted from deal pages, and
  a recent-redemptions mini-list.
- **`/account/history`** — paginated redemption receipts (bill/discount/paid/
  saved per row) with a receipt detail modal.
- **`/account/savings`** — KPI cards (total, this month, this year),
  savings-by-category donut + legend, monthly bar chart, all from the summary
  endpoint; skeleton/empty/error states.
- **`/account` overview** — Total Savings, Deals Redeemed, This Month,
  Membership (plan + status), yearly savings chart, and recent activity, all
  from live endpoints. (Static reward-points/cashback cards were removed —
  no invented figures.)
- **`/partner/dashboard/scanner`** — Scan QR (camera via `QRScanner` +
  manual token entry) → `validate` → customer first name, membership badge,
  deal + discount rules → bill input with a **client-side estimate clearly
  labeled "Estimate — final amounts are computed by the server"** (never the
  source of truth) → Confirm → server receipt screen with "Scan next
  customer" reset. Expired/used/invalid tokens get plain-language error
  states and a re-scan path.
- **`/admin/redemptions`** — date/customer/business/deal/bill/discount/saved/
  status table with status filter + search, CSV export, and a receipt drawer.

Security copy throughout: the QR is a signed, single-use, ~90s token carrying
no PII — "QR refreshes every ~90 seconds and can't be screenshotted for reuse."
`DigitalMembershipCard` no longer fabricates rotating tokens client-side; it
renders a live panel only when a real token is passed.

## Customer Dashboard (Phase 7)

`lib/dashboard.ts` is the dashboard data layer, built to the `/api/v1`
contract and defensive about what is deployed: every fetcher tolerates
`{ data }`-wrapped or bare payloads and returns `null` on 404/501 so pages
render honest states instead of invented figures.

- `GET /users/me/dashboard` → `{ membership: { planName, status, expiresAt, daysLeft },
  stats: { totalSavings, redemptionsCount, favoritesCount, activeVouchers, walletBalance,
  rewardPoints, cashbackBalance, referralsCount } (paisa), recentActivity: [{ type, label, at, amount? }],
  recommendedDeals: […] }` via `fetchDashboard()`.
- `GET/PATCH /users/me` → profile incl. `profileCompleteness` (`fetchProfile`/`updateProfile`).
- `POST /auth/password/change { currentPassword, newPassword }`.
- `GET /auth/sessions`, `POST /auth/sessions/logout-all`.
- `GET/PATCH /users/me/notification-preferences`.

Pages:

- **Dashboard shell** (`app/(account)/account/layout.tsx`) — branded header with
  the user's avatar, **real** membership badge from `GET /memberships/me`
  (no more hardcoded "342d left"; the fake notifications "2" badge is gone),
  sidebar nav with active states, mobile drawer, sticky mobile nav, logout.
- **`/account` overview** — greeting, membership badge, stat grid (prefers
  `/users/me/dashboard`, falls back to the individual endpoints), recent
  activity timeline (dashboard activity first, redemptions fallback), monthly
  savings chart, recommended-deals carousel, quick actions, and a **renew CTA
  when the membership expires in ≤ 14 days**. The old hardcoded "earn Rs. 250
  each" referral banner was removed — referral amounts are never invented.
- **`/account/profile`** — real data form (name, phone, DOB, city from
  `/locations/cities`, language, marketing opt-in), avatar upload (graceful
  when the backend has no avatar endpoint), profile-completeness progress bar,
  unsaved-changes guard, error states. Email is read-only (change via support).
- **`/account/security`** — change password with a strength meter, active
  sessions list (hidden honestly when the API isn't deployed), "log out other
  devices" with a confirm modal. No fake 2FA teaser.
- **`/account/notifications`** — preferences toggles persisted to
  `/users/me/notification-preferences` (optimistic updates with rollback) plus
  the real `/notifications` inbox with mark-as-read and honest empty states.
- **`/account/referrals`** — real referral code from `GET /auth/me`, copy-code /
  copy-link buttons, WhatsApp/Facebook/X/email share; stats section honestly
  says the referral-stats service isn't live yet (no hardcoded bonus amounts).
- **`/account/wallet`, `/rewards`, `/cashback`, `/vouchers`** — try the real
  endpoints (`/wallet`, `/rewards/transactions`, `/cashback`, `/vouchers/my`);
  while those backends are still stubs they render honest "coming soon" cards
  instead of invented balances. Nothing shows a fake figure.
- **`/account/support`** — submits to `POST /support/tickets` and lists real
  tickets when the API is live; otherwise an honest "coming soon" state.
- **`/account/saved`** (unchanged) — real favorites via `lib/catalog`.

## Partner Dashboard (Phase 8)

`lib/partner.ts` is the partner data layer, built to the `/api/v1` contract
and defensive about what is deployed: every new Phase 8 fetcher returns `null`
on 404/501 so pages render honest states instead of invented figures.

- `GET /businesses/mine` → business list (multi-business switcher in the
  header/sidebar, persisted to localStorage) via `fetchMyBusinesses()`.
- `GET /businesses/mine/dashboard` → `{ business, stats: { activeDeals,
  pendingApproval, draftDeals, totalBranches, redemptionsToday,
  redemptionsThisMonth, totalSavingsGiven (paisa), viewsThisMonth,
  ratingAverage, reviewsCount, staffCount }, dealsByStatus, recentRedemptions,
  topDeals }` via `fetchPartnerDashboard()`.
- `GET/POST /businesses/mine/:id/staff`, `PATCH/DELETE …/staff/:staffId` via
  `fetchStaff`/`inviteStaff`/`updateStaffRole`/`removeStaff`.
- `GET /businesses/mine/:id/analytics?from&to` →
  `{ redemptionsByDay, savingsByDay, viewsByDay, topBranches, hourlyHeat }`
  via `fetchPartnerAnalytics()` (null on 404/501).
- `GET /businesses/mine/:id/redemptions?…` (paginated ledger) via
  `fetchPartnerRedemptions()` (null on 404/501).
- `usePartnerBusiness()` (exported from the dashboard layout) exposes the
  active business, the list, `switchBusiness`, and `refresh` to every page.

Pages:

- **Partner shell** (`app/(partner)/partner/dashboard/layout.tsx`) — real
  business name, role badge (`Owner/Manager/Cashier/Scanner`), ✓ Verified
  chip, business switcher when the account owns several businesses, mobile
  drawer, role-gated via `AuthGuard` (`PARTNER_ROLES`).
- **Overview** — greeting + verification chips, 8-stat grid, redemptions-by-day
  7d chart (prefers the analytics endpoint, falls back to aggregating the
  recent-redemption feed), top deals, recent redemptions, quick actions
  (New Deal, Open Scanner, Add Branch, Invite Staff).
- **Deals / Branches / Profile** — the Phase 3–4 managers were already fully
  wired to real endpoints; left as-is (deals manager covers list, filters,
  create/edit/duplicate, submit/pause/resume/publish and approval statuses).
- **Redemptions** — real ledger table (date, deal, customer first name,
  branch, bill/discount/paid/saved), deal filter, search, pagination, receipt
  modal; honest "not live yet" state until the partner redemptions API deploys.
- **Analytics** — date-range picker (7/30/90d + custom), SVG bar charts for
  redemptions/savings/views by day, top branches, hourly heat strip; honest
  "not live yet" state.
- **Staff** — invite-by-email + role select (`Manager/Cashier/Scanner`), staff
  list with role change/remove behind `ConfirmModal`, last-owner protection
  surfaced in the UI ("Protected — last owner"); backend guards still apply.
- **Customers** — insights derived from the partner's own redemption ledger
  (total visits, unique customers, repeat rate, avg bill, savings given, most
  loyal visitors); explicitly notes that matching is by first name only and
  customer PII never reaches the partner.
- **Reviews / Settlements / Vouchers** — those backends are stubs as of Phase
  8, so these pages show honest "not live yet" cards — the old fake reviews,
  fake settlement rows (ST-2041…), and fake voucher batches were removed.
  Reviews also try the real endpoint first in case the backend lands early.
- **Notifications** — real `/notifications` inbox via `lib/dashboard` with
  mark-read; honest empty state (no seed notifications).
- **Settings** — honest error when the settings API isn't live (the old
  "saved (demo mode)" lie is gone).
- **Support** — submits to `POST /support/tickets` and only claims success
  when the API accepts the ticket (the old catch-and-pretend is gone).

## Notes

- **Auth:** see "Authentication" above — in-memory access token, httpOnly
  refresh cookie owned by Next.js session routes, `jose`-verified edge
  middleware, role-gated dashboards.
- **Seed fallback:** every data page tries the live API first and falls back to
  clearly-marked DEV seed data with a console warning. Never production content.
- **QR security:** customer QRs carry short-lived signed tokens (never raw IDs);
  `QRScanner` uses `getUserMedia` + canvas with a pluggable decode stub ready
  for jsqr/zxing. All discount math is server-computed.
- **Money:** formatted via `lib/format.ts`; the backend stores minor units and
  uses decimal-safe arithmetic — the frontend never originates financial figures.
- **Catalog API (`lib/catalog.ts`, Phase 3):** typed layer over the locations /
  categories / businesses / branches contract —
  `GET /locations/cities?search=`, `GET /categories`, `GET /categories/:slug`,
  `GET /businesses?q&categoryId&cityId&areaId&ratingMin&hasDeals&sort&page&pageSize`,
  `GET /businesses/:slug`, `GET /branches/nearby?lat&lng&radiusKm`,
  `POST /businesses/applications` (multipart via `apiForm` in `lib/api.ts`).
  Admin: `GET|POST /admin/categories`, `PATCH /admin/categories/:id`,
  `POST /admin/categories/:id/toggle`, `DELETE /admin/categories/:id`,
  `POST /admin/categories/:id/subcategories`, `DELETE /admin/subcategories/:id`,
  `GET|POST /admin/businesses`, `POST /admin/businesses/:id/verify|suspend|reactivate`,
  `GET /admin/applications`, `POST /admin/applications/:id/approve|reject|request-changes`,
  `GET /admin/branches`, `GET /admin/locations/tree`,
  `POST|PATCH /admin/locations/cities[/:id]`, `POST|DELETE /admin/locations/areas[/:id]`.
  Partner: `GET|PATCH /partner/profile`, `POST /partner/profile/logo|cover` (multipart),
  `GET|POST /partner/branches`, `PATCH|DELETE /partner/branches/:id`.
- **File uploads:** client-side validation via `validateUploadFile()` in
  `lib/api.ts` (type + size); multipart posts go through `apiForm()`.
- **Register city picker:** searchable combobox hitting `GET /locations/cities?search=`
  (debounced), with seed fallback when the API is unreachable.

## Admin Dashboard (Phase 9)

- **`lib/admin.ts`** — admin data layer: `GET /admin/overview`, `/admin/activity`,
  `/admin/fraud-alerts`, `/admin/health`, batch moderation
  (`POST /admin/businesses/batch`, `POST /admin/deals/batch` → per-item
  `{ results: [{ id, ok, error? }] }`), `GET /users` admin list + suspend/reactivate,
  `GET /admin/audit-logs`, roles/permissions CRUD (`/roles`, `/roles/permissions`),
  reviews moderation, support tickets, report exports, settings. Every new
  endpoint is 404/501-defensive: undeployed backends render honest "not live yet"
  states instead of invented figures.
- **Shell** (`admin/layout.tsx`): grouped sidebar (Overview, Moderation, Catalog,
  Commerce, Users, Engage, Insight, System), super-admin-only items (Roles,
  Settings, Admin Staff) gated by role, real admin identity chip + role badge,
  live fraud-flag counter in the header.
- **Overview** (`/admin`): real KPI cards from `/admin/overview`, moderation queue
  shortcuts with live counts, recent activity feed, system health strip.
- **Moderation:** partner applications, deal approvals, payment verifications are
  fully real; businesses and deals pages gained checkbox batch actions
  (verify/suspend/reactivate; approve/reject/pause/publish) with per-item result
  toasts. Fraud alerts (`/admin/fraud-alerts`) shows SUSPICIOUS_QR_RATE flags
  with links to the flagged user. Reviews moderation and support tickets try the
  real endpoints and honestly state "not live yet" (backends are still stubs).
- **System:** roles & permissions editor on real Phase 2 CRUD; audit log viewer on
  real `/admin/audit-logs` (honest fallback); health page (`/admin/health`) with
  DB/Redis/storage/queue cards; settings and reports wired to real endpoints with
  honest "not live yet" states where backends are stubs.
- **Honesty pass:** all seed/fake figures removed from wallet, cashback,
  settlements, campaigns, banners, staff, analytics, vouchers, rewards, referrals,
  commissions, notifications, and CMS admin pages — they show explicit
  "not live yet" states instead of invented data.

## Rewards Economy (Phase 10)

`lib/dashboard.ts` grew a Phase 10 economy section, built to the `/api/v1`
contract and defensive about what is deployed: every fetcher tolerates
`{ data }`-wrapped or bare payloads and returns `null` on 404/501, so pages
render honest states instead of invented figures.

- **Vouchers** — `GET /vouchers/my` → `{ id, code, title, description, valuePaisa,
  status, expiresAt, businessName }`; `POST /vouchers/claim { code }`. The
  **`/account/vouchers`** page lists vouchers with copy-code, status chips and
  expiry countdowns, a claim-a-code form, and a "how to use" guide (the partner
  applies the voucher code at confirmation).
- **Rewards (points)** — `GET /rewards/account` →
  `{ balance, lifetimeEarned, lifetimeRedeemed }`; `GET /rewards/transactions`
  (paginated); `GET /rewards/catalog` → `{ id, title, description, pointsCost, type }`;
  `POST /rewards/:id/redeem { idempotencyKey }` → voucher. The
  **`/account/rewards`** page shows a balance hero, a redeemable catalog with a
  confirm modal (buttons disable when the balance is short), the created voucher
  code, and a paginated points ledger. No policy claims are made unless the API
  provides them.
- **Cashback** — `GET /cashback` → `{ balance, pending, lifetimeEarned,
  lifetimeWithdrawn }` (paisa); `GET /cashback/transactions` (paginated);
  `POST /cashback/withdraw { amountPaisa, method, accountDetails }`;
  `GET /cashback/withdrawals`. The **`/account/cashback`** page shows the four
  balance cards, a withdrawal request form (amount ≤ balance, server enforces),
  withdrawal history with statuses, and the cashback ledger.
- **Referrals** — `GET /referrals/my-code`, `GET /referrals/stats` →
  `{ referredCount, qualifiedCount, pendingCount, totalRewardsEarned,
  referred, referrerReward, refereeReward }`, `POST /referrals/apply { code }`.
  The **`/account/referrals`** page shows copy/share buttons (incl. WhatsApp),
  stat cards, the referred-friends list, an "I have a code" apply form, and
  "how it works" steps. Reward amounts are shown only when the API returns
  configured rewards; otherwise the copy stays generic — never hardcoded.

## Engagement (Phase 11)

`lib/engagement.ts` is the Phase 11 data layer (notifications, reviews, support
tickets, CMS), defensive on 404/501 → pages render honest "not live yet" states.

- **Notification bell** (`components/NotificationBell.tsx`) — global unread badge in
  the public, account and partner headers; polls `/notifications/unread-count`
  every 60s + refreshes on window focus; dropdown shows the latest 8 with
  "mark all read" and a link to the inbox. The `/account/notifications` page is
  a full inbox (all/unread filters, mark-read on open, unread count) plus the
  notification-preference toggles.
- **Reviews** (`components/ReviewSection.tsx`) — rating summary (average, count,
  distribution bars), review list with partner replies, and a write-a-review
  form. Submit is gated server-side: the API returns `NO_REDEMPTION` when the
  user has no confirmed redemption at the business, surfaced as
  "reviews unlock after your first visit". Wired into the Reviews tabs on
  `/deal/[slug]` and `/business/[slug]`. Star input reuses the interactive
  `Rating` component from `@bachatly/ui`.
- **Support** (`components/SupportTickets.tsx`) — FAQ accordion (from
  `/support/faq`, static fallback), ticket list, new-ticket form with category
  select, and a ticket thread view with a message composer. Shared by
  `/account/support` and `/partner/dashboard/support`. The public contact form
  posts to the ticket API; success is claimed only when the API accepts it.
- **CMS** (`components/CmsContent.tsx`) — `/about`, `/terms`, `/privacy`,
  `/faq`, `/contact` render from `GET /cms/pages/:slug` (light client-side sanitize
  strips scripts/iframes/event handlers) with the existing static copy as
  fallback. The homepage renders active CMS banners as an auto-rotating hero
  carousel (`components/BannerCarousel.tsx`, 5s rotate, dots, arrows, links).

## Analytics & Finance (Phase 12)

`lib/finance.ts` is the Phase 12 data layer (platform analytics, reports,
commissions, settlements), defensive on 404/501 → every page renders an honest
"not live yet" state instead of invented figures. All money arrives in integer
paisa and is displayed in Rs. via `paisaToPkr` + `formatPKR`.

- **Admin analytics** (`/admin/analytics`) — date-range picker (7/30/90d, custom)
  over `GET /analytics/admin/overview`: KPI cards (redemptions, savings, new
  users, membership revenue), SVG trend charts (redemptions/savings/users/
  revenue per day), category donut, top-businesses and top-deals tables.
- **Reports** (`/admin/reports`) — seven report-type tabs
  (membership-sales, redemptions, savings, commissions, settlements,
  businesses, users) with date filters, a 20-row preview table, summary
  strip, and CSV/XLSX export buttons. Export uses a blob download
  (`exportReport`); when the server returns 501 the page says XLSX is not
  enabled yet and falls back to CSV.
- **Commissions** (`/admin/commissions`) — ledger table with status/date/
  business filters, pagination, totals for the visible rows, and an adjust
  action behind a reason-required modal (audited server-side).
- **Settlements** (`/admin/settlements`) — batch table with filters,
  run-settlement form (business select + period), mark-paid modal (payout
  reference + method, both required), cancel-with-reason modal, and a receipt
  drawer per settlement showing gross/commission/net.
- **Partner settlements** (`/partner/dashboard/settlements`) — business's own
  batches from `GET /settlements/business/:id` (falls back to the filtered
  list endpoint), with gross/commission/net cards and receipt modals.

## SEO, Performance & Accessibility (Phase 13)

### SEO
- **Root layout** (`app/layout.tsx`): full metadata — title template, description,
  keywords, `metadataBase`, canonical, OpenGraph + Twitter cards, robots rules;
  `viewport` with `themeColor: #0B6B4F`.
- **Dynamic metadata**: `/deal/[slug]` and `/business/[slug]` are now server
  wrappers exporting `generateMetadata` (title, description, OG image, canonical)
  fetched server-side from the API with seed fallback; the interactive UI moved to
  `deal-client.tsx` / `business-client.tsx` (slug passed as a prop).
- **JSON-LD**: Organization + WebSite (with SearchAction) on the homepage;
  `Offer` (PKR pricing from paisa) on deal pages; `LocalBusiness` (address, geo,
  aggregate rating) on business pages.
- **`app/manifest.ts`**: PWA manifest (name, icons, theme color, categories).
- **`app/icon.svg`**: original Bachatly mark; `public/icons/icon-{192,512}.png`
  generated from it; `public/og-cover.png` (1200×630) for social cards.
- **`app/sitemap.ts`**: now fetches live deal/business/category slugs from the
  public API (hourly revalidation) and falls back to seeds when the API is
  unreachable. `robots.ts` reviewed — account/admin/partner/api paths disallowed.
- **Semantic HTML**: single `<h1>` per page; `<header>/<main>/<footer>` landmarks;
  every layout's `<main>` carries `id="main-content"`.

### Performance
- **next/image** migration: deal/business hero images (`priority`, `sizes`),
  gallery thumbnails, logos, `DealCard`/`BusinessCard` images (with `sizes`),
  banner carousel, admin/partner previews — all use `fill` + `object-cover`;
  below-fold images lazy-load by default in next/image.
- **`next.config.mjs`**: `remotePatterns` extended with env-driven
  `NEXT_PUBLIC_STORAGE_HOST` plus `http://localhost` for local MinIO dev.
- **Bundle**: audited — no moment/lodash/date-fns; only `next/image` (framework)
  added. No new runtime dependencies.

### Accessibility
- **Dialogs**: new shared `useDialogA11y` hook (Escape, focus trap, initial focus,
  focus restoration, scroll lock) used by `Modal`, `Drawer`, `BottomSheet`;
  `BottomSheet` gained Escape handling it previously lacked.
- **Dropdowns**: notification bell and account menu close on Escape, return focus
  to the trigger, and use a non-focusable overlay for click-outside (the old
  `aria-hidden` button pattern was removed).
- **Carousel**: `aria-roledescription="carousel"`, arrow-key navigation, Escape
  stops rotation, auto-rotation pauses on hover/focus, honors
  `prefers-reduced-motion`, controls are siblings of the slide link (no nested
  interactives), dots use `aria-current`.
- **Tabs**: arrow-key / Home / End navigation with roving `tabindex`.
- **Forms**: `Select` and `Textarea` now associate `<label>` via `htmlFor`/`id`
  like `Input`; `ConfirmModal` reason field labeled; auth/scanner/profile forms
  audited — all inputs labeled or aria-labeled.
- **Contrast**: theme `success` darkened `#16A34A` → `#15803D` (3.26:1 → 5.02:1
  on white, now WCAG AA for body text). `text-accent`/`text-brand-500` usages were
  audited — accent only appears on dark backgrounds, brand-500 is unused for text.
- **Images/buttons**: meaningful `alt` text everywhere (decorative images use
  `alt=""` inside labeled containers); icon-only buttons all carry `aria-label`.
- **Skip link**: "Skip to content" in the root layout, visible on focus;
  global `:focus-visible` ring already in `globals.css`.

### Follow-ups (not done in Phase 13)
- Replace the placeholder `og-cover.png` and generated icons with final brand
  artwork before launch (including a 180×180 `apple-touch-icon.png`).
- Run Lighthouse (`pnpm build && pnpm start`, then audit) — code changes are in
  place but no measured scores yet (node_modules not installed in this env).
- `DealCard` favorite button was moved out of the wrapping `<Link>` (nested
  interactive removed); verify the absolute positioning visually after build.
