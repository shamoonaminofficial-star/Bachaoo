# Bachatly API Reference (v1)

Base URL: `{API_URL}/api/v1` · Auth: Bearer JWT (access) + httpOnly refresh cookie · Docs UI: `/api/docs` (Swagger)

## Conventions

- **Money:** integer smallest currency unit (PKR paisa). `Rs. 5,000` = `500000` paisa. All money math server-side, decimal-safe — never trust frontend calculations.
- **IDs:** UUID v4. **Timestamps:** ISO-8601 (Asia/Karachi default). Soft-delete via `deletedAt` on major entities.
- **Pagination:** `?page=1&perPage=20&sort=createdAt&order=desc` → `{ data, meta: { page, perPage, total, totalPages } }`. `pageSize` is capped at 100 on every list endpoint. Aggregation/report endpoints cap date ranges at 366 days (`RANGE_TOO_LARGE` beyond that).
- **Error format:** `{ "code": "DEAL_EXPIRED", "message": "...", "details": {...} }`
- **Rate limits:** 120 req/min global per IP; 5/10min on password change, 5/min on auth/OTP endpoints, 10/min on QR token minting, 30/min on sessions listing.
- **Versioning:** all routes live under `/api/v1` (URI versioning). Breaking changes ship as `/api/v2`; v1 responses may carry `Deprecation: true` + `Sunset: <date>` headers for endpoints slated for removal (minimum 90-day notice).
- **Caching:** public GET endpoints (catalog, locations, CMS, reviews) return `Cache-Control: public, max-age=60, stale-while-revalidate=30` and weak ETags — send `If-None-Match` for cheap 304s. Authenticated endpoints return `private, no-store`. Mutations return `no-store`.
- **Health:** `GET /api/v1/healthz` — public liveness probe (no auth, no DB), for load balancers.

## Auth — `/auth`

### Token delivery
- **accessToken** — returned in the JSON body, short-lived (15 min). Send as `Authorization: Bearer <token>`.
- **refreshToken** — set as an httpOnly cookie (`bachatly_refresh`, path `/api/v1/auth`, 30 days, `Secure` in production) **and** echoed in the JSON body for native/mobile clients. `/auth/refresh` accepts the token from the body **or** the cookie.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | firstName, lastName, email, phone (03XXXXXXXXX), password (min 8, letter+number), cityId?, referralCode?, acceptTerms=true. Creates user + profile + wallet + reward account, assigns CUSTOMER role, generates unique referral code, creates INVITED Referral when referralCode given (all in one transaction). Sends verification email. → 201 `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | email **or** phone + password. Brute-force protected (5 fails / 15 min per IP+identifier → 403). Generic `INVALID_CREDENTIALS` on failure. → 200 token pair |
| POST | `/auth/refresh` | Rotates the pair. Reuse detection: valid JWT with no live session revokes **all** user sessions (theft protection, audited as `auth.refresh_token_reuse`); 60s grace window tolerates concurrent refresh. → 200 new pair |
| POST | `/auth/logout` | Revokes the current session (body or cookie token), clears the cookie |
| POST | `/auth/logout-all` | Revokes every session for the user (all devices) |
| POST | `/auth/sessions/logout-all` | Alias under the sessions namespace (Phase 7 contract) |
| GET | `/auth/sessions` | Active sessions: id, ip, userAgent, createdAt, expiresAt, lastSeen (rotatedAt ?? createdAt). 30/min |
| POST | `/auth/password/change` | `{ currentPassword, newPassword }` — verifies current, enforces policy, rejects unchanged, revokes ALL sessions (caller must re-login), audited. 5/10min. Codes: `WEAK_PASSWORD`, `INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED` |
| GET | `/auth/me` | Profile + roles + permissions + active membership summary |
| POST | `/auth/otp/request` | `{ identifier, channel: email\|sms\|whatsapp }`. 3/hour per identifier (Redis) + 5/min route throttle. OTP stored as SHA-256 in Redis, 5-min TTL. Email sends via SMTP; SMS/WhatsApp are provider-ready stubs (dev-logged until configured) |
| POST | `/auth/otp/verify` | `{ identifier, code }`. Marks email/phone verified; issues a token pair when the identifier belongs to an account |
| POST | `/auth/verify-email` | `{ token }` — single-use 24h JWT (consumed from Redis) |
| POST | `/auth/forgot-password` | `{ email }` — always 200 (no account enumeration); single-use 30-min token emailed |
| POST | `/auth/reset-password` | `{ token, newPassword }` — single-use; revokes all sessions on success |

### Users — `/users` (permissions: `user.read`, `user.update`, `user.suspend`, `admin.manage`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users?q&role&status&cityId&hasMembership&sort&order&page&pageSize` | Search (name/email/phone), filters, sort whitelist, paginated |
| GET | `/users/:id` | Full profile: roles, permissions, active membership, wallet/reward balances, cashback by status, referral stats, recent sessions + audit logs |
| PATCH | `/users/:id` | Admin-editable fields only (name, phone, city, status). Roles **cannot** be changed here |
| POST | `/users/:id/suspend` | `{ reason }` — audited; kills all sessions immediately; SUPER_ADMIN protected |
| POST | `/users/:id/reactivate` | Audited |
| POST | `/users/:id/roles` | `{ roles: [...] }` — replaces the full role set (admin only, audited; blocks self-demotion from SUPER_ADMIN) |

### Self-service customer profile — `/users/me` (role: CUSTOMER; registered before `/users/:id` so the static routes match first)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users/me/dashboard` | Aggregated customer dashboard, Redis-cached 5 min (`dashboard:<userId>`), busted by redemptions/favorites/membership flows. `{ membership: { planName, planSlug, status, expiresAt, daysLeft } \| null, stats: { totalSavings, redemptionsCount, favoritesCount, activeVouchers, walletBalance, rewardPoints, cashbackBalance, referralsCount }, recentActivity: [{ type: 'redemption'\|'saving'\|'wallet', label, at, amount }] (latest 8), recommendedDeals: [up to 6 { id, title, slug, discountPercent, business }] }` — all money in paisa |
| GET | `/users/me` | Own profile + `profileCompleteness` % (name/email/phone/city/area/DOB/avatar/language) |
| PATCH | `/users/me` | Customer-editable fields: firstName, lastName, phone (03XXXXXXXXX, unique), cityId, areaId (must belong to city), dateOfBirth, language (ur/en), marketingOptIn (→ notification prefs). Codes: `PHONE_IN_USE`, `CITY_NOT_FOUND`, `AREA_NOT_FOUND`, `AREA_CITY_MISMATCH` |
| POST | `/users/me/avatar` | Multipart field `avatar` (jpeg/png/webp, ≤3 MB). Uploads to `avatars/` and sets profile avatar; returns `{ url }` |
| GET | `/users/me/notification-preferences` | Topic toggles (dealAlerts, savingsSummary, membershipReminders, referralUpdates, marketing); absent row = all-on defaults |
| PATCH | `/users/me/notification-preferences` | Upsert toggles (lazy-creates the row) |

### Roles — `/roles` (permission: `admin.manage`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/roles` | All roles with permission keys + user counts (SUPER_ADMIN flagged protected) |
| POST | `/roles` | Create role (UPPER_SNAKE_CASE name) |
| GET/PATCH/DELETE | `/roles/:id` | Read / update description / delete (blocked when users assigned) |
| GET | `/roles/permissions` | All permissions grouped |
| POST | `/roles/:id/permissions` | `{ permissions: [...] }` — sync full permission set (audited) |

Seed's 11 roles / 20 permissions remain canonical.

Roles/permissions enforced via `@Roles()` + `@Permissions()` guards plus `@Public()` opt-out (RBAC matrix in `docs/analysis/02-roles-permissions.md`).

## QR Redemption (signed short-lived tokens)

QR data is **never** a raw user/deal/membership ID. Flow:

1. `POST /redemptions/qr` `{ dealId, branchId? }` (CUSTOMER, 10/min) → backend runs the full eligibility gate (active membership when required, deal PUBLISHED + within dates, business active + verified, branch covered, plan eligible, usage/per-user/daily/monthly limits) → returns signed JWT carrying **only** `{ jti, dealId, branchId?, exp }` (no userId/membershipId in claims; ownership lives in the server-side Redis issuance record `qr:jti:<jti>` → `{ userId, dealId, branchId, issuedAt }`) with 60–120s TTL (`QR_TOKEN_TTL_SECONDS`). Response: `{ token, expiresIn }`. Eligibility failures return codes: `MEMBERSHIP_REQUIRED`, `MEMBERSHIP_INACTIVE`, `DEAL_NOT_LIVE`, `DEAL_EXPIRED`, `BRANCH_NOT_ELIGIBLE`, `PLAN_NOT_ELIGIBLE`, `USAGE_LIMIT_REACHED`, `PER_USER_LIMIT_REACHED`, `DAILY_LIMIT_REACHED`, `MONTHLY_LIMIT_REACHED`.
2. Partner scans → `POST /redemptions/validate` `{ token }` (BUSINESS_OWNER / BUSINESS_MANAGER / CASHIER / SCANNER) → verifies signature + expiry + issuance record + replay state → returns `{ customer: { firstName }, membership: { status, planName } | null, deal: { id, title, discountPercent, maxDiscountPaisa, dealType }, branch, meta: { flags, mintAttemptsLastHour } }`. Does NOT mark the token used. Codes: `QR_INVALID`, `QR_EXPIRED`, `QR_ALREADY_USED`. Fraud hook: mint attempts per user/hour are counted in Redis (`qr:mint:<userId>`); >20/hour adds `SUSPICIOUS_QR_RATE` to `meta.flags` (flag only, never blocks — for admin review).
3. Partner enters bill → `POST /redemptions/confirm` `{ token, billAmountPaisa }` (staff roles) → re-validates (atomic Redis `SET NX` replay guard `qr:used:<jti>`, DB `idempotencyKey` = jti), re-runs the eligibility gate on the token's owner, then **recomputes** bill → discount → saving → cashback (on the *paid* amount) → points inside ONE DB transaction, writing `Redemption` (+ frozen `calculationSnapshot`) + `SavingsTransaction` + `Cashback`/`CashbackTransaction` + `RewardAccount`/`RewardTransaction` + deal `redemptionCount` + `AuditLog` → returns receipt `{ redemptionId, bill, discount, paid, saving, cashback, points }` (all integer paisa). Replay/duplicate/expired → 409 with codes. Cashback is `APPROVED` by default; set the `cashback.redemptionAutoApprove` system setting to `false` to hold it in `PENDING` for manual review.

Screenshot/replay, duplicate, and expired-token redemptions are rejected.

Related endpoints: `GET /redemptions/history` (CUSTOMER, paginated), `GET /redemptions/deal/:id/eligibility?*branchId*` (CUSTOMER, `{ eligible, reasons[] }`, never throws), `GET /redemptions/savings/summary` (CUSTOMER → `{ total, thisMonth, thisYear, byCategory[], byMonth[] }` in paisa, from the immutable `SavingsTransaction` ledger), `GET /redemptions/admin?status=&businessId=&q=` (ADMIN, paginated; `q` searches customer name/email or deal title).

## Key endpoints by module

| Module | Notable endpoints |
|---|---|
| `users` | ✅ `GET /users` (search/filter/sort/paginate), `GET /users/:id` (full profile), `PATCH /users/:id`, `POST /users/:id/suspend\|reactivate` (audited), `POST /users/:id/roles` (audited) |
| `roles` | ✅ CRUD `/roles`, `GET /roles/permissions`, `POST /roles/:id/permissions` (sync, audited) |
| `businesses` | CRUD `/businesses`, `/businesses/:id/verify\|suspend`, partner application `/businesses/applications` (status workflow) |
| `branches` | CRUD `/branches`, per-business scoping |
| `categories` | CRUD + ordering + subcategories `/categories` |
| `deals` | ✅ Full: public search/filter/sort `/deals`, detail `/deals/:slug` (computed savings + eligibility + badges), partner `GET /deals/mine`, CRUD, `/deals/:id/submit|pause|resume|publish|duplicate`, images upload, approval queue `/deals/admin/queue`, `/deals/:id/approve|reject|request-changes` (permission `deal.approve`), hourly auto-expiry cron |
| `memberships` | ✅ Plans: public `GET /memberships/plans`, admin CRUD `GET /memberships/plans/admin`, `POST/PATCH/DELETE /memberships/plans/:id` (`membership.manage`); purchase `POST /memberships/purchase` (rate-limited, price from plan); manual receipt `POST /memberships/manual-receipt/:paymentId` (multipart); `GET /memberships/me` (+daysRemaining), `/memberships/history`; admin `GET /memberships/admin`, `/memberships/:id/extend|cancel`, `POST /memberships/admin/assign`, `GET /memberships/expiring-soon`; daily expiry cron |
| `vouchers` | `/vouchers`, `/vouchers/:code/redeem`, rewards-marketplace `/vouchers/marketplace` |
| `rewards` | `/rewards/balance`, `/rewards/transactions` (ledger), `/rewards/redeem` |
| `wallet` | `/wallet`, `/wallet/transactions`, admin adjustments (confirmation + reason + audit) |
| `cashback` | `/cashback`, status transitions pending→approved→available→redeemed |
| `referrals` | `/referrals/code`, `/referrals/stats`, reward triggers on qualifying event |
| `payments` | ✅ Modular gateways (`src/modules/payments/gateways/`): `ManualGateway` working, `JazzCashGateway`/`EasypaisaGateway` integration stubs, `StripeGateway` ready-stub; `POST /payments/intent`, `POST /payments/webhook/:gateway` (per-gateway signature verification, idempotent on `gatewayTxnId`), `GET /payments/bank-accounts` (public), `GET /payments/:id` (owner/admin), `GET /payments/admin?status=&gateway=&q=` (`payment.read`), `POST /payments/:id/refund` (`payment.refund`, audited), `POST /payments/:id/approve\|reject` (manual verification, `payment.verify`, audited) |
| `reviews` | `/reviews` (verified-purchase gate configurable), moderation queue |
| `notifications` | `/notifications`, `/notifications/campaigns` (targeting, scheduling, sent/delivered/opened/clicked stats), push subscription |
| `reports` | `/reports/:type?from&to&format=csv` (membership sales, payments, redemptions, savings, commissions, settlements) |
| `analytics` | `/analytics/overview|customers|businesses|admin` with date ranges |
| `cms` | `/cms/pages/:slug` (public), admin CRUD |
| `support` | `/support/tickets`, `/support/tickets/:id/messages` |
| `admin` | `/admin/audit-logs`, `/admin/settings`, `/admin/roles` |
| `favorites` | ✅ `GET /favorites?type=deal|business`, `POST /favorites` (`{targetType,targetId}`), `DELETE /favorites/:id`, `GET /favorites/check?targetType&targetId` |
| `search` | ✅ `GET /search?q=` (top-5 deals/businesses/categories), `GET /search/suggest?q=` (autocomplete) |

## Deals — `/deals`

Public search `GET /deals` filters: `q` (title/description/business name), `categoryId`, `subcategoryId`, `cityId`, `areaId`, `businessId`, `minDiscount`/`maxDiscount` (%), `dealType`, `maxPrice` (paisa), `ratingMin` (business rating), `membershipRequired=true|false`, `availableNow=true|false` (default true = live deals only). Sort: `recommended` (default), `nearby` (needs `lat`+`lng`; in-memory scoring over top-300 candidates — documented approximation), `newest`, `discount`, `popular`, `ending`. Pagination standard. Result lists cached 60s in Redis (version key bumped on every deal write). Each item includes business summary, category, first image, `branchCount`, `distanceKm` (when geo given), `badges[]`, and `computed: { youSavePaisa, memberPricePaisa }`.

Detail `GET /deals/:slug` (optional auth): gallery, business with branches + hours, category/subcategory, terms, dates, limits, `badges[]`, `computed` savings (reported **only** when originalPrice + dealPrice are both known — never estimated), and `eligibility: { eligible, reasons[] }` with codes `NOT_LOGGED_IN`, `MEMBERSHIP_REQUIRED`, `PLAN_NOT_ELIGIBLE`, `DEAL_NOT_LIVE|NOT_STARTED|EXPIRED`, `USAGE_LIMIT_REACHED`, `PER_USER_LIMIT_REACHED`, `BUSINESS_INACTIVE`. `viewCount` increments fire-and-forget.

Badges (thresholds in `deal-helpers.ts`): `EXCLUSIVE` (membership + restricted plans), `MEMBERS_ONLY`, `TRENDING` (≥25 redemptions/7d), `NEW` (<7d old), `LIMITED_TIME` (<72h left), `POPULAR` (≥100 lifetime redemptions).

Partner (`BUSINESS_OWNER`/`BUSINESS_MANAGER`, ownership-checked): `GET /deals/mine` (all statuses), `POST /deals` (all spec fields; server validates pricing sanity, dates, category/subcategory, plan ids, branch ownership; `branchIds: []` = all branches), `PATCH /deals/:id` (DRAFT/REJECTED only), `POST /deals/:id/duplicate`, `POST /deals/:id/images` (multipart ≤8 images, 2 MB each), `DELETE /deals/images/:imageId`, `POST /deals/:id/submit` (→PENDING_APPROVAL), `POST /deals/:id/pause|resume`, `POST /deals/:id/publish` (APPROVED→PUBLISHED; partner's own or admin), `DELETE /deals/:id` (soft, draft/rejected only).

Admin (permission `deal.approve`): `GET /deals/admin/queue?status=PENDING_APPROVAL` (default), `POST /deals/:id/approve` (→APPROVED, stores reviewedBy/reviewedAt), `POST /deals/:id/reject` (reason **required**), `POST /deals/:id/request-changes` (notes **required**, →DRAFT), `POST /deals/:id/publish`. Invalid transitions → 409 `INVALID_STATUS_TRANSITION`. All audited. Hourly `@Cron` marks PUBLISHED deals past `endDate` as `EXPIRED` (requires `@nestjs/schedule`).

## Favorites — `/favorites` (authenticated)

`POST /favorites` `{ targetType: 'deal'|'business', targetId }` → 409 `FAVORITE_EXISTS` on duplicates (unique constraints). `DELETE /favorites/:id` (owner only). `GET /favorites?type=deal|business` paginated with summaries. `GET /favorites/check?targetType&targetId` → `{ favorited, favoriteId }`.

## Search — `/search` (public)

`GET /search?q=` (min 2 chars) → `{ deals[≤5], businesses[≤5], categories[≤5] }` each tagged with `type`. `GET /search/suggest?q=` → flat autocomplete `[{ type, id, label, slug }]`. ILIKE-based; trigram/pg_search noted as the future upgrade path in code comments.


## Locations — `/locations`

Public (cached 5 min in Redis, invalidated on writes):

| Method | Endpoint | Description |
|---|---|---|
| GET | `/locations/countries` | active countries |
| GET | `/locations/countries/:code/provinces` | provinces of a country |
| GET | `/locations/provinces/:id/cities` | active cities of a province |
| GET | `/locations/cities?search=` | flat city search (registration city picker), max 50 |
| GET | `/locations/cities/:id/areas` | active areas of a city |

Admin (`ADMIN`/`SUPER_ADMIN`): `POST /locations/countries`, `PATCH /locations/countries/:id`, `POST /locations/countries/:id/provinces`, `POST /locations/provinces/:id/cities`, `PATCH /locations/cities/:id`, `POST /locations/cities/:id/default` (exactly one default city), `PATCH /locations/cities/:id/toggle` (default city cannot be disabled), `POST /locations/cities/:id/areas`, `PATCH /locations/areas/:id`, `DELETE /locations/areas/:id` (409 if branches use it), `GET /locations/tree` (full country→province→city→area tree for the admin manager). All audited.

## Categories — `/categories`

Public: `GET /categories` (active, ordered, with subcategories + `subcategoryCount` + `activeDealCount`), `GET /categories/:slug`.

Admin (`ADMIN`/`SUPER_ADMIN`): `GET /categories/admin/all?includeInactive=`, `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id` (soft-delete; 409 `CATEGORY_IN_USE` with counts when businesses/deals reference it), `POST /categories/reorder` (`{ ids }` in display order, rewritten 0..n transactionally), `PATCH /categories/:id/toggle`, `POST /categories/:id/icon`, `POST /categories/:id/image` (multipart, images ≤2 MB, validated MIME, stored via the storage abstraction), subcategory CRUD at `/categories/:id/subcategories`. All audited.

## Businesses — `/businesses`

Public: `GET /businesses` (`q`, `categoryId`, `cityId`, `areaId`, `ratingMin`, `hasDeals=true|false`, `verifiedOnly=true|false`; sort `rating|dealsCount|name|createdAt`; pagination; includes `activeDealCount`, `maxDiscountPercent`), `GET /businesses/:slug` (branches with hours, live deals summary, approved reviews summary).

Partner application (public): `POST /businesses/applications` (multipart: fields per spec + `logo` + up to 5 `documents`; docs validated: images/PDF ≤5 MB). Authenticated: `GET /businesses/applications/mine`.

Owner (`BUSINESS_OWNER`/`BUSINESS_MANAGER`): `GET /businesses/mine`, `PATCH /businesses/mine/:id` (editable fields only — verification/active flags are admin-only), `POST /businesses/mine/:id/logo` and `POST /businesses/mine/:id/cover` (multipart `file`, images ≤3 MB).

Admin: `GET /businesses/admin/all` (same filters as public plus `status=active|suspended|all`), `POST /businesses` (`business.create`), `PATCH /businesses/:id` (`business.update`), `POST /businesses/:id/verify` (`business.approve`), `POST /businesses/:id/suspend` (`{ reason }` — deactivates the business and pauses its PUBLISHED deals; reactivation does NOT auto-resume deals), `POST /businesses/:id/reactivate`, `DELETE /businesses/:id` (soft). Application review (`business.approve`): `GET /businesses/applications?status=&q=`, `GET /businesses/applications/:id`, `POST /businesses/applications/:id/review` (→ UNDER_REVIEW), `POST .../approve` (creates Business + BusinessOwner + owner User with BUSINESS_OWNER role in one transaction; passwordless until forgot-password), `POST .../reject` and `POST .../request-info` (reason required). All audited.

### Phase 8 — partner dashboard, analytics, staff (roles: `BUSINESS_OWNER`/`BUSINESS_MANAGER`, admins)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/businesses/mine/dashboard` | Aggregated dashboard for one business (`?businessId=` picks for multi-business owners). `{ business: { id, name, logo, verified, active }, stats: { activeDeals, pendingApproval, draftDeals, totalBranches, redemptionsToday, redemptionsThisMonth, totalSavingsGiven (paisa), totalRedemptions, viewsTotal, ratingAverage, reviewsCount, staffCount }, dealsByStatus: { published, pending, drafts, expired, paused, rejected, approved }, recentRedemptions: [latest 10], topDeals: [top 5] }`. Redis-cached 5 min (`partner-dashboard:<businessId>`); busted by deal writes/transitions, branch writes, redemption confirm, staff changes |
| GET | `/businesses/mine/:id/analytics?from&to` | Partner analytics, always fresh (no cache: date ranges make cache invalidation unreliable). Default last 30 days, Asia/Karachi: `{ summary: { redemptions, savingsGiven (paisa), uniqueCustomers, viewsTotal }, redemptionsByDay: [{ date, redemptions, savingsGiven }], hourlyHeat: [24 counts], topBranches, dealViews }`. Codes: `INVALID_DATE_RANGE` |
| GET | `/businesses/mine/:id/redemptions?dealId&branchId&from&to&q&page&pageSize` | Partner redemption ledger (CONFIRMED only): customer first name/email, deal/branch, bill/discount/paid/saving/cashback/points + frozen `calculationSnapshot`; `q` matches customer name/email or deal title |
| GET | `/businesses/mine/:id/staff` | Active staff list (user info, role, branch) |
| POST | `/businesses/mine/:id/staff` | Invite `{ email, role: OWNER\|MANAGER\|CASHIER\|SCANNER, branchId? }`. Existing users are linked immediately (active) and granted the matching platform role; otherwise a PENDING `StaffInvitation` (72h) is created and an accept token returned once for forwarding. Rate-limited 10/10min. Codes: `STAFF_ALREADY_LINKED`, `INVITATION_PENDING` |
| PATCH | `/businesses/mine/:id/staff/:staffId` | Change staff role. Codes: `CANNOT_REMOVE_LAST_OWNER` |
| DELETE | `/businesses/mine/:id/staff/:staffId` | Remove staff link (audited). Codes: `CANNOT_REMOVE_LAST_OWNER`, `STAFF_NOT_FOUND` |
| POST | `/businesses/staff-invitations/:token/accept` | Accept an invitation. The signed-in user's email must match the invited email. Codes: `INVITATION_NOT_FOUND`, `INVITATION_USED`, `INVITATION_EXPIRED`, `INVITATION_EMAIL_MISMATCH` |

**QR staff scoping (Phase 8 security fix):** `POST /redemptions/validate` and `POST /redemptions/confirm` now require the caller to be staff of the token's deal business — owner (`ownerUserId`), co-owner (`BusinessOwner`), or an ACTIVE `BusinessStaff` link (any staff role); admins bypass. Otherwise `403 NOT_BUSINESS_STAFF`. Note: the last remaining owner of a business can never be removed or demoted (`409 CANNOT_REMOVE_LAST_OWNER`).

**Schema change needing a migration + `prisma generate`:** new `StaffInvitation` model (`InvitationStatus` enum), `User.sentStaffInvitations` and `Business.invitations` back-relations.

## Branches

| Method | Endpoint | Description |
|---|---|---|
| GET | `/branches` | admin: all branches, filters `businessId`, `q`, pagination |
| GET | `/businesses/:businessId/branches` | public: active branches; owner/admin may pass `?includeInactive=true` |
| POST | `/businesses/:businessId/branches` | owner/manager/admin create (ownership-checked) |
| GET | `/branches/nearby?lat&lng&radiusKm=` | Haversine in SQL, ordered by distance, `radiusKm` 0.5–100 |
| GET | `/branches/:id` | public branch detail |
| PATCH | `/branches/:id` | owner/manager/admin update |
| DELETE | `/branches/:id` | soft-delete; 409 `BRANCH_HAS_DEALS` when deals are attached |

Branch fields: name, managerName, phone, address, cityId, areaId, latitude/longitude, openingHours (`{"mon":["09:00","22:00"]}` — validated shape), isActive. All mutations audited.

## Memberships — `/memberships`

Plans (all money in integer paisa; salePrice ≤ regularPrice enforced server-side):

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/memberships/plans` | public | active plans, featured first, then displayOrder |
| GET | `/memberships/plans/admin` | admin (`membership.read`) | all plans incl. inactive |
| POST | `/memberships/plans` | admin (`membership.manage`) | create plan |
| PATCH | `/memberships/plans/:id` | admin (`membership.manage`) | update plan |
| DELETE | `/memberships/plans/:id` | admin (`membership.manage`) | soft-delete; 409 `PLAN_IN_USE` when active memberships exist |

Purchase (authenticated, `@Throttle` 10/min): `POST /memberships/purchase` `{ planId, gateway: 'MANUAL'|'BANK_TRANSFER'|'JAZZCASH'|'EASYPASA'|'STRIPE' }` → creates `Payment` (PENDING, **amount from the plan row — never client input**) + `PaymentAttempt` and returns `{ paymentId, gateway, kind, clientData }`. `kind` = `MANUAL_INSTRUCTIONS` (bank accounts + transfer instructions) for manual; otherwise whatever the gateway returns (`REDIRECT` hosted-checkout URL, `MOBILE_WALLET` wallet/OTP payload, or `CLIENT_SECRET`). If the gateway can't build an intent (keys not configured) the payment is marked CANCELLED and a 503 `GATEWAY_NOT_CONFIGURED` is returned — no orphans.

Manual bank transfer: `POST /memberships/manual-receipt/:paymentId` (multipart: `file` image/PDF ≤5 MB + optional `bankName`/`accountTitle`/`iban` for statement cross-checking — the amount is never taken from the client; the charge stays the plan price) → payment becomes AWAITING_VERIFICATION. Verification lives on the payments side: `POST /payments/:id/approve` (activates the membership) / `POST /payments/:id/reject` (reason required), both `payment.verify`, both audited.

Activation (`activateMembership`, called from webhooks and manual approval): runs in a transaction — payment PAID, membership created/extended (startDate = now or after the current active membership's endDate so renewals stack; endDate = start + durationDays with integer ms math), `MembershipHistory` row (ACTIVATED), idempotent on paymentId (replaying the same payment returns the existing membership — no duplicates). Referral qualifying event: on the user's **first** paid membership, an INVITED referral moves to QUALIFIED→REWARDED and the referrer gets a ledgered POINTS reward (`referral.reward_points` setting, default 500). Signup bonus: first-ever membership activation also credits a ledgered points EARN transaction (`signup.reward_points` setting, default 100).

Customer: `GET /memberships/me` (active membership + plan + `daysRemaining`, may be fractional), `GET /memberships/history` (all memberships + history entries), and `POST /memberships/me/cancel` `{ reason }` (cancels own active membership, audited).

Admin (audited; every change writes `MembershipHistory` + audit log): `GET /memberships/admin?status=&q=` (status ACTIVE/EXPIRED/CANCELLED/PENDING), `POST /memberships/:id/extend` `{ days, reason }` (ACTIVE only), `POST /memberships/:id/cancel` `{ reason }` (ACTIVE only), `POST /memberships/admin/assign` `{ userId?, userEmail?, planId, days?, reason }` (free admin-granted membership, logged as ASSIGNED with the plan snapshot). `GET /memberships/expiring-soon?days=7` returns memberships ending within N days — the data hook Phase 11 notifications will consume. A daily `@Cron` (`everyDayAtMidnight`) marks past-endDate ACTIVE memberships EXPIRED and logs history rows.

## Payments — `/payments`

Gateway architecture: `src/modules/payments/gateways/` defines the `PaymentGateway` interface (`createIntent(payment): GatewayIntent`; `verifyWebhook(rawBody, signature, headers): WebhookEvent`; optional `refund(...)`). `GatewayFactory` resolves by name (`MANUAL`/`BANK_TRANSFER`, `JAZZCASH`, `EASYPaisa`, `STRIPE`); adding a gateway = new class + registration in `gateways.module.ts`, no other changes. Implementations:

- `ManualGateway` — fully working (bank accounts read from the `bank_accounts` SystemSetting; no external calls; no webhooks).
- `JazzCashGateway` — integration stub: implements the interface, validates config on first use, and throws 503 `GATEWAY_NOT_CONFIGURED` until credentials are set. TODO markers point to the integrator doc for hash/MPI endpoints. **No real API formats were invented.**
- `EasypaisaGateway` — same pattern (its docs' hash approach is noted as a TODO to verify during integration).
- `StripeGateway` — ready-stub: real HMAC-SHA256 signature verification (`t=,v1=` scheme with timestamp tolerance) is implemented; intent/event payload parsing is marked TODO.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/payments/intent` | auth | generic payment intent (non-membership order types; memberships should use `/memberships/purchase`) |
| POST | `/payments/webhook/:gateway` | public (signature-verified) | gateway callback: signature verified over the RAW body by the gateway's own scheme (`toleranceMs` timestamp check); idempotent on `gatewayTxnId` (already-PAID → acknowledged no-op); on success marks PAID in a transaction and activates memberships for MEMBERSHIP orders |
| GET | `/payments/bank-accounts` | public | active bank accounts (`bankName`, `accountTitle`, `iban`, optional `note`) from settings |
| GET | `/payments/:id` | owner or admin | payment with attempts + manual receipt |
| GET | `/payments/admin?status=&gateway=&q=` | admin (`payment.read`) | paginated, filterable payments |
| POST | `/payments/:id/refund` | admin (`payment.refund`) | `{ amount? (paisa, ≤ paid), reason }`; calls gateway refund when supported, else records an offline/manual refund; → REFUNDED or PARTIALLY_REFUNDED; audited |
| POST | `/payments/:id/approve` | admin (`payment.verify`) | manual transfer: → PAID + membership activation; audited |
| POST | `/payments/:id/reject` | admin (`payment.verify`) | manual transfer: → CANCELLED, reason required; audited |

Invalid state transitions return 409/422 with codes (`INVALID_STATUS_TRANSITION`, `PAYMENT_NOT_VERIFIABLE`, `PAYMENT_NOT_PAID`). Never accept amounts from the client; never store card numbers/CVV; rate-limit purchase endpoints.

## Storage

`STORAGE_SERVICE` (global): env-driven — `S3_ENDPOINT` set → S3-compatible (ready-stub: interface + env wiring final, SDK calls marked TODO), otherwise local disk (`UPLOAD_DIR`, dev). Used for category icons/images, application documents, and manual-payment receipts.

## Webhooks

Gateway callbacks are verified server-side (HMAC signature, idempotency key on `gatewayTransactionId`). Never store card numbers/CVV.

## Audit

All sensitive mutations (membership changes, approvals, refunds, wallet/cashback adjustments, settlements, permission changes) write to `AuditLog` with actor, role, action, entity, old/new values, IP, user agent.

## Admin control panel — `/admin` (Phase 9; roles: `ADMIN`/`SUPER_ADMIN`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/overview` | Platform KPIs: users (total/new/customers/partners), businesses (total/pending/verified/suspended), deals (live/pending/drafts/expired), memberships (active/expiring/churned30d), revenue (membership this month + total, pending commissions, settled this month), activity (redemptions, savings total), queues (pending businesses/deals/payments/tickets/reviews/invitations). Redis-cached 5 min (`admin:overview`); busted best-effort by business/deal/membership/payment/redemption/ticket/review mutations |
| GET | `/admin/dashboard` | Alias of `/admin/overview` (backward compat with the Phase 1 stub route) |
| GET | `/admin/activity?limit=` | Unified recent-activity feed (latest 30): `{ type, label, at, amount?, actor?, meta? }` |
| GET | `/admin/health` | System health: `{ status, env, uptimeSec, db: { ok, latencyMs }, redis: { ok, latencyMs }, storage: { backend } }` |
| GET | `/admin/audit-logs?page&pageSize&action&actorId&entity` | Immutable audit trail, newest first |
| POST | `/admin/businesses/batch` | `{ ids[], action: suspend\|reactivate\|verify, reason? }` (max 50; suspend needs a reason). Reuses `BusinessesService` — suspension also pauses live deals. Per-item `{ id, ok, error? }` |
| POST | `/admin/deals/batch` | `{ ids[], action: approve\|reject\|pause\|publish, reason? }` (max 50; reject needs a reason). approve/reject/publish reuse `DealsService`; pause uses an admin-level PUBLISHED→PAUSED transition (the partner-only `pause()` asserts ownership). Per-item results |
| GET | `/admin/reviews/pending` | Review moderation queue (newest PENDING first) |
| POST | `/admin/reviews/:id/moderate` | `{ action: APPROVE\|REJECT, reason? }` (reject needs a reason). Only PENDING reviews |
| GET | `/admin/support/tickets?status&q&page` | Support ticket triage list |
| GET | `/admin/support/tickets/:id` | Ticket + message thread |
| PATCH | `/admin/support/tickets/:id` | `{ status?, priority?, assignedTo?, note? }` — note is appended as an `[internal]` thread message |
| GET | `/admin/fraud-alerts?limit=` | Phase 6 `SUSPICIOUS_QR_RATE` signals, persisted to the capped Redis list `fraud:alerts` (200 events, 7d TTL) at validate time; never blocks redemption |
| POST | `/admin/fraud-alerts/ack` | Clear the feed after review (the ack itself is audit-logged) |

Batch endpoints are throttled (10/min) and audited (`admin.businessesBatch`, `admin.dealsBatch`). Single-mutation queues that already exist stay on their original routes: business applications (`GET/POST /businesses/applications*`), deal approval queue (`GET /deals/admin/queue`, `POST /deals/:id/approve|reject`), manual payment verification (`/payments` `payment.verify`).

## Economy — vouchers, rewards, cashback, referrals (Phase 10)

All money in integer paisa. Every mutation writes ledger rows; histories are never edited (adjustments are new rows). Referral reward amounts come **only** from system settings — defaults are 0 (disabled), nothing is hardcoded:

- `referral.referrer_points` — points for the referrer on qualification
- `referral.referrer_cashback_paisa` — cashback (paisa) for the referrer
- `referral.referred_points` — points for the referred user
- `referral.referred_cashback_paisa` — cashback (paisa) for the referred user

### Vouchers — `/vouchers`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/vouchers/campaigns` | Create a campaign: `{ title, description, codePrefix?, totalCount (1–10000), valuePaisa, minBillPaisa?, perUserLimit? (default 1), startsAt, expiresAt, businessId? }`. Generates N crypto-random unique codes (stored in `VoucherCode`, unique index). Roles: ADMIN/SUPER_ADMIN (+ BUSINESS_OWNER/BUSINESS_MANAGER/MARKETING_MANAGER, who must scope to a business they manage) |
| GET | `/vouchers/campaigns` | List campaigns (admins: all; partners: their own businesses'); includes `claimedCount` |
| GET | `/vouchers/my` | Customer's claimed vouchers with derived status ACTIVE/USED/EXPIRED (role: CUSTOMER) |
| POST | `/vouchers/claim` | Convenience: `{ code }` — resolves the code to its campaign and claims it (same guards). The UI uses this so users only need the code. Codes: `CODE_REQUIRED`, `CODE_NOT_FOUND` (+ campaign claim codes) |
| POST | `/vouchers/:id/claim` | `{ code }` — claim one pre-generated code. Atomic single-claim via `UPDATE ... WHERE claimedAt IS NULL` (row count = race guard). Checks: campaign live, per-user limit, code valid. Codes: `VOUCHER_NOT_FOUND`, `VOUCHER_NOT_LIVE`, `VOUCHER_EXPIRED`, `PER_USER_LIMIT_REACHED`, `CODE_NOT_FOUND`, `CODE_ALREADY_CLAIMED` |

Bill-time: `POST /redemptions/confirm` accepts optional `voucherCode`. Server-side validation (ownership, AVAILABLE, not expired, campaign live, `minBillPaisa` met, business match when the voucher is business-scoped), consumed atomically inside the same DB transaction (`updateMany` on AVAILABLE), voucher value added to the discount (clamped so the paid amount never goes negative), `Redemption.userVoucherId` set, details frozen in `calculationSnapshot.voucher`. Response gains `voucherDiscount` (paisa). Codes: `VOUCHER_NOT_FOUND`, `VOUCHER_NOT_OWNED`, `VOUCHER_ALREADY_USED`, `VOUCHER_EXPIRED`, `VOUCHER_NOT_LIVE`, `VOUCHER_MIN_BILL_NOT_MET`, `VOUCHER_BUSINESS_MISMATCH`.

### Rewards (points) — `/rewards`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/rewards/account` | `{ balance, lifetimeEarned, lifetimeRedeemed }` (role: CUSTOMER) |
| GET | `/rewards/transactions?page&pageSize` | Immutable points ledger (EARN/REDEEM/EXPIRE/ADJUST) |
| GET | `/rewards/catalog` | Redeemable rewards with linked voucher info; `redeemable` is false when no voucher is linked or stock is out |
| POST | `/rewards/:id/redeem` | Atomic: stock decrement + points debit + voucher mint in one tx. Idempotent via `Idempotency-Key` header (or `idempotencyKey` body field) — the stored response is replayed on retry (`idempotentReplay: true`). Codes: `REWARD_NOT_FOUND`, `REWARD_NOT_CONFIGURED`, `REWARD_EXPIRED`, `REWARD_SOLD_OUT`, `INSUFFICIENT_POINTS` |
| POST | `/rewards` | Admin: create a catalog reward `{ title, description, pointsCost, voucherId (required, must be active), stock? }` |
| PATCH | `/rewards/:id` | Admin: update a catalog reward |
| DELETE | `/rewards/:id` | Admin: soft-delete a catalog reward |
| POST | `/rewards/adjust` | `{ userId, points, reason, approvalNote? }` — admin point adjustment, always ledgered as ADJUST. Reason required and audited. Negative amounts need SUPER_ADMIN + `approvalNote`. Codes: `REASON_REQUIRED`, `SUPER_ADMIN_REQUIRED`, `APPROVAL_NOTE_REQUIRED`, `INSUFFICIENT_POINTS` |

### Cashback — `/cashback`

Balance is derived, never stored: `APPROVED` cashback minus non-rejected withdrawals.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/cashback` | `{ balance, pending, lifetimeEarned, lifetimeWithdrawn }` (paisa, role: CUSTOMER) |
| GET | `/cashback/transactions?page&pageSize` | Cashback ledger |
| GET | `/cashback/withdrawals?page&pageSize` | Own withdrawal history (account numbers masked) |
| POST | `/cashback/withdraw` | `{ amountPaisa, method: BANK\|EASYPAISA\|JAZZCASH, accountDetails, idempotencyKey? }` — atomically reserves the amount (per-user Postgres advisory lock serialises concurrent requests); creates a PENDING withdrawal + DEBIT ledger row. Over-balance → `409 INSUFFICIENT_CASHBACK`. Idempotent via key |
| GET | `/cashback/admin/pending` | PENDING cashback queue (roles: ADMIN/SUPER_ADMIN/FINANCE_MANAGER) |
| POST | `/cashback/:id/approve` | PENDING → APPROVED (audited) |
| POST | `/cashback/:id/reject` | `{ reason }` — PENDING → REJECTED (reason required, audited) |
| GET | `/cashback/admin/withdrawals/pending` | PENDING withdrawal requests |
| PATCH | `/cashback/admin/withdrawals/:id/approve` | `{ payoutReference? }` — records the payout (audited) |
| PATCH | `/cashback/admin/withdrawals/:id/reject` | `{ reason }` — releases the reservation with a CREDIT ledger row (audited) |

### Referrals — `/referrals`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/referrals/my-code` | `{ code, link }` — shareable link is `${NEXT_PUBLIC_SITE_URL}/r/<code>` (role: CUSTOMER) |
| GET | `/referrals/stats` | `{ referredCount, qualifiedCount, pendingCount, totalPointsEarned, totalCashbackEarnedPaisa }` — real counts, never invented |
| POST | `/referrals/apply` | `{ code }` — apply a code within 7 days of signup. One code per user; never your own. Codes: `APPLY_WINDOW_EXPIRED`, `REFERRAL_ALREADY_APPLIED`, `CODE_NOT_FOUND`, `SELF_REFERRAL` |
| GET | `/referrals/admin` | Admin referral list (role: ADMIN/SUPER_ADMIN) |
| GET | `/referrals/admin/:id` | Referral detail + granted rewards |

Qualifying: the referred user's first **CONFIRMED** redemption triggers `ReferralsService.tryQualifyOnFirstRedemption` inside the confirm transaction (guarded on the INVITED status, so it can never double-reward — the memberships module's first-paid-membership path marks REWARDED the same way). Both sides are granted per the `referral.*` system settings (points via the rewards ledger, cashback via APPROVED cashback + ledger row, `ReferralReward` rows recorded), then the referral moves INVITED → QUALIFIED → REWARDED. A hourly `qualifyReferrals` cron catches any INVITED referrals the hook missed.

## Notifications, reviews, support, CMS (Phase 11)

### Notifications — `/notifications` (authenticated)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/notifications?page&pageSize&unreadOnly` | Caller's in-app inbox, newest first |
| GET | `/notifications/unread-count` | `{ unread }` — badge count |
| POST | `/notifications/:id/read` | Mark one as read (own only). Code: `NOTIFICATION_NOT_FOUND` |
| POST | `/notifications/read-all` | `{ marked }` |
| POST | `/admin/notifications/broadcast` | `{ title, body, audience: all\|customers\|partners, channels? }` — rate-limited 3/hour, audited; chunked dispatch (250/chunk), campaign row tracks `sentCount`. Codes: standard validation |

Dispatch (`NotificationDispatchService.dispatch(userIds, { type, title, body, data?, channels })`):
- `IN_APP` is always persisted; `EMAIL` uses the SMTP adapter; `SMS`/`WHATSAPP` use the ready-stub adapters.
- When a provider is **not configured**, the channel row is recorded as `SKIPPED` — never pretend-delivered. No phone/email on file → `SKIPPED` with a reason.
- `type` routes to `NotificationPreference` topics (`membershipReminders`, `dealAlerts`, `savingsSummary`, `referralUpdates`, `marketing`); transactional types (`SUPPORT_REPLY`, `TICKET_STATUS`) always deliver.
- Best-effort: `dispatch()` never throws; event hooks fire-and-forget.

Event hooks (all best-effort, never fail the primary transaction): membership activated/expired (daily expiry cron), membership expiring soon (daily `sendExpiryReminders` cron, deduped to 1/24h via `recentlySent`, honors `notifications.expiry_reminder_days` setting), deal approved/rejected/changes-requested → business owner, referral qualified → both sides, voucher claimed, reward redeemed, cashback approved/withdrawal approved/rejected, support staff reply → ticket owner.

### Reviews — `/reviews`

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/reviews/business/:businessId?page&pageSize` | **Public.** Approved reviews + `{ aggregate: { average, count, distribution } }` |
| POST | `/reviews` | `{ businessId, dealId?, rating 1-5, title?, body?, photos?[] }` — CUSTOMER only, 10/min. **Server-enforced:** ≥1 CONFIRMED redemption at the business (code `NO_REDEMPTION`). One review per (business, deal) — reposting updates and re-queues for moderation. Status: `reviews.autoApprove` setting (default `false` → PENDING). Photos: ≤5 https URLs |
| POST | `/reviews/:id/reply` | Partner reply (BUSINESS_OWNER/MANAGER of that business, audited, one reply per review). Codes: `ALREADY_REPLIED`, `INVALID_REPLY` |

Moderation stays on the Phase 9 routes (`GET /admin/reviews/pending`, `POST /admin/reviews/:id/moderate { APPROVE|REJECT, reason? }`); approve/reject now recomputes the denormalized `Business.ratingAvg`/`ratingCount`.

### Support — `/support`

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/support/faq` | **Public.** FAQ grouped by category (from CMS entries) |
| GET | `/support/tickets?page&pageSize&status` | Own tickets (customers/partners); all for SUPPORT_AGENT/ADMIN |
| GET | `/support/tickets/:id` | Ticket + immutable message thread |
| POST | `/support/tickets` | `{ subject, category, message, attachments?[], businessId? }` — 10/hour, audited. Generates `TKT-YYYY-XXXXXX`. Categories: PAYMENT, DEAL, MEMBERSHIP, ACCOUNT, BUSINESS, TECHNICAL, OTHER |
| POST | `/support/tickets/:id/messages` | Reply (owner or staff). Staff reply → `WAITING_FOR_CUSTOMER` + notifies owner (SUPPORT_REPLY). Closed tickets reject new messages (`TICKET_CLOSED`) |
| POST | `/support/tickets/:id/close` | Owner closes own ticket |

Admin triage stays on Phase 9 (`GET/PATCH /admin/support/tickets*`).

### CMS — `/cms`

Public: `GET /cms/pages/:slug` (published only), `GET /cms/banners/active?placement=` (active + within dates, priority-ordered), `GET /cms/faqs` (grouped).
Admin (ADMIN/CONTENT_MANAGER, audited): `GET/POST /cms/admin/pages`, `PATCH /cms/admin/pages/:id` (publish via `isPublished`), banner CRUD (`GET/POST/PATCH/DELETE /cms/admin/banners`, `POST /cms/admin/banners/upload` multipart `file` ≤5MB), FAQ CRUD (`/cms/admin/faqs*`).

Seed: `terms`, `privacy`, `about`, `contact` pages are seeded as **DRAFT** (`isPublished: false`) with original placeholder copy — explicitly not legal advice; replace with reviewed legal text before launch. FAQ entries are seeded published.

## Analytics, reports, commissions, settlements (Phase 12)

### Analytics — `/analytics`

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/analytics/admin/overview?from&to` | **Admin.** Platform trends: `redemptionsByDay` (count/savings/paid), `newUsersByDay`, `membershipRevenueByDay`, `topBusinesses`, `topDeals`, `categoryBreakdown`, `totals`. Asia/Karachi day bucketing, Redis-cached 10 min per range (TTL is the net — ranges make targeted busts unreliable). Device/channel splits are intentionally omitted (not tracked yet). |
| GET | `/analytics/business/:id?from&to` | Per-business analytics — delegates to the canonical `PartnerAnalyticsService` (one implementation). |
| GET | `/analytics/customer/me?from&to` | **Customer.** Savings/redemption trends feeding the savings page: `savingsByDay`, `categoryBreakdown`, `totals`. |

All money is integer paisa.

### Reports — `/reports` (roles: ADMIN/SUPER_ADMIN/FINANCE_MANAGER)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/reports/membership-sales?from&to` | `{ summary: { count, total }, rows }` by plan. Paisa. |
| GET | `/reports/redemptions?from&to&businessId` | `{ summary: { count, totalSavings, totalPaid, avgBill }, rows }`. |
| GET | `/reports/savings?from&to` | Total + `byCategory` + `byMonth`. |
| GET | `/reports/commissions?from&to&businessId` | Accrued/settled totals + per-business rows. |
| GET | `/reports/settlements?from&to&status` | Settlement rows + `byStatus` summary. |
| GET | `/reports/businesses?from&to` | Partner performance: redemptions, savings given, paid volume, commission, rating. |
| GET | `/reports/users?from&to` | Signups by day (customers/partners), active memberships. |
| GET | `/reports/:type/export?format=csv&from&to` | CSV download (`Content-Disposition: attachment`), audited, 2/min, capped at 10,000 rows (`truncated` flag). Valid types: `membership-sales`, `redemptions`, `savings`, `commissions`, `settlements`, `businesses`, `users`; unknown → `REPORT_NOT_FOUND`. `format=xlsx` → **501 `XLSX_NOT_SUPPORTED`** (no spreadsheet library installed — honest, not a fake file). |

### Commissions — `/commissions`

Commission accrues automatically inside the redemption confirm transaction as an immutable `CommissionEntry` row (`kind: REDEMPTION`, `status: ACCRUED`).

Rate resolution (never hardcoded): **BUSINESS rule > CATEGORY rule > GLOBAL rule > `commission.default_bps` system setting** (default 0). Math: `commissionPaisa = floor(paidAmount * bps / 10000)` (percentage) or `min(fixedAmount, paidAmount)` (fixed) — integer paisa, floor rounding.

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/commissions?businessId&kind&status&from&to` | Admin/finance: ledger with filters, paginated. |
| GET | `/commissions/business/:id` | Partner (owner/manager of that business): own ledger + status totals. |
| POST | `/commissions/:id/adjust` | Admin: `{ amountPaisa, reason }` — creates a new signed **ADJUSTMENT** row (history never edited). Audited. Codes: `COMMISSION_NOT_FOUND`, `REASON_REQUIRED`, `INVALID_AMOUNT`. |
| GET | `/commissions/rules` | Admin: commission rate rules. |
| POST | `/commissions/rules` | Admin: `{ scope: GLOBAL\|CATEGORY\|BUSINESS, businessId?, categoryId?, type: PERCENTAGE\|FIXED, percentBps?, fixedAmount? }`. Audited. Codes: `BUSINESS_REQUIRED`, `CATEGORY_REQUIRED`, `INVALID_BPS`, `INVALID_FIXED`. |
| PATCH | `/commissions/rules/:id` | Admin: update a rule. Audited. |
| DELETE | `/commissions/rules/:id` | Admin: soft-delete a rule. Audited. |

### Settlements — `/settlements`

A settlement is the platform's **commission invoice to a business** for a period: `grossAmount` = total customer-paid amounts (paisa), `commissionAmount` = accrued commission (paisa), `netAmount` = commissionAmount + adjustments = what the business owes the platform.

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/settlements?businessId&status&from&to` | Admin/finance: batches, paginated. |
| GET | `/settlements/business/:id` | Partner (owner/manager): own settlements. |
| POST | `/settlements/run` | Admin/finance: `{ businessId?, from, to }` — aggregates ACCRUED entries into PENDING settlements. **Idempotent per (businessId, period)** via unique constraint (returns the existing row on re-run). 5/min, audited. Codes: `INVALID_PERIOD`, `NO_ACCRUED_ENTRIES` (per-business skip). |
| POST | `/settlements/:id/mark-paid` | Admin/finance: `{ payoutReference, method? }` → PAID, entries → SETTLED. Audited. Codes: `SETTLEMENT_NOT_FOUND`, `ALREADY_PAID`, `SETTLEMENT_CANCELLED`, `REFERENCE_REQUIRED`. |
| POST | `/settlements/:id/cancel` | Admin: `{ reason }` → CANCELLED; entries released back to ACCRUED. Audited. Codes: `REASON_REQUIRED`, `ALREADY_PAID`. |

A weekly cron (Mondays 00:05 Asia/Karachi) generates PENDING drafts for the previous week — **drafts only, never auto-pays**.
