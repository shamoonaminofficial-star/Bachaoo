# Bachatly — Sitemap (Full)

Brand: **Bachatly** — "Save More. Live More."
Default currency: PKR (displayed as `Rs.`). Default timezone: `Asia/Karachi`. Launch country: Pakistan (multi-city, multi-country ready).

## Layout & Route-Group Conventions (Next.js App Router)

| Route group | Layout | Auth |
|---|---|---|
| `(public)` | Public header + footer, sticky mobile nav | Public |
| `(account)` | Customer sidebar + bottom mobile nav | Customer (`Customer` role, active membership where noted) |
| `(partner)` | Partner sidebar + topbar | Business staff (`Business Owner`, `Business Manager`, `Cashier`, `Scanner Operator`) |
| `(admin)` | Admin sidebar + topbar + breadcrumbs | Admin staff (`Support Agent`, `Content Manager`, `Finance Manager`, `Marketing Manager`, `Administrator`, `Super Admin`) |
| `(auth)` | Minimal centered layout | Guest only (redirects logged-in users) |

---

## 1. Public Website `(public)`

| URL | Page | Layout | Auth | SEO notes |
|---|---|---|---|---|
| `/` | Homepage (Hero + search, categories, featured deals, nearby deals, popular businesses, how it works, membership, savings calculator, testimonials, FAQ preview) | Public | None | Highest priority; `index, follow`; OG/Twitter cards; JSON-LD `WebSite` + `SearchAction` |
| `/deals` | Deals listing (search, filters, sort, pagination/infinite scroll) | Public | None | Canonical `/deals`; filter params via query string, canonical strips tracking params; JSON-LD `ItemList` |
| `/deal/[slug]` | Deal detail (gallery, business summary, pricing, terms, map, reviews, Redeem / Get Membership / Save / Share / Directions) | Public | None to view; **active membership required to redeem** (gate with CTA) | `index, follow`; OG image; JSON-LD `Offer`; slug e.g. `/deal/20-percent-off-pizza` |
| `/deals/[city]` | Location deals landing, e.g. `/deals/lahore` | Public | None | Only generated where real content exists (no thin pages); canonical city pages |
| `/businesses` | Business directory (search by business/category/city/area, filters, sort) | Public | None | `index, follow`; JSON-LD `ItemList` |
| `/business/[slug]` | Business profile (cover, logo, verified badge, tabs: Deals / About / Locations / Reviews / Photos) | Public | None | `index, follow`; JSON-LD `LocalBusiness`; slug e.g. `/business/urban-slice` |
| `/categories` | All categories grid | Public | None | `index, follow` |
| `/category/[slug]` | Category page with deals & businesses | Public | None | `index, follow`; JSON-LD `ItemList` |
| `/category/[slug]/[city]` | Category × city page, e.g. `/category/restaurants/sargodha` | Public | None | Only where content quality warrants; otherwise noindex/redirect to category page |
| `/membership` | Membership explainer + plan cards + FAQs + savings proof points | Public | None | `index, follow`; high conversion priority |
| `/checkout/[planSlug]` | Membership checkout (plan summary, payment method: card / bank transfer / manual) | Public | **Login required** | `noindex, nofollow` |
| `/payment/success`, `/payment/failed`, `/payment/pending` | Payment result pages (receipt for manual transfer pending state) | Public | Login required | `noindex, nofollow` |
| `/rewards` | Rewards marketplace (exchange points for vouchers/deals; points cost shown clearly) | Public | None to browse; login required to redeem | `index, follow` |
| `/partner` | Partner landing ("Grow Your Business With Us") + benefits + CTA | Public | None | `index, follow` |
| `/partner/apply` | Partner application form | Public | None | `noindex` (conversion page) |
| `/search` | Global search results (deals, businesses, categories; autocomplete on header) | Public | None | Query pages `noindex, follow` |
| `/help` | Help center / FAQ hub | Public | None | `index, follow`; JSON-LD `FAQPage` |
| `/about`, `/contact`, `/careers` | Company pages | Public | None | `index, follow` |
| `/terms`, `/privacy`, `/refund-policy` | Legal pages (CMS-managed) | Public | None | `index, follow` |

### Auth pages `(auth)`

| URL | Auth |
|---|---|
| `/login` | Guest only |
| `/register` | Guest only |
| `/forgot-password` | Guest only |
| `/reset-password` | Guest only (token-gated) |
| `/verify-email` | Guest / logged-in un-verified |
| `/verify-otp` | OTP step (OTP-ready architecture) |

---

## 2. Customer Dashboard `(account)` — `/account`

| URL | Section | Auth | Notes |
|---|---|---|---|
| `/account` | Overview (welcome, membership status/expiry, total savings, points, cashback, vouchers, redemptions, referral earnings, recent activity, recommended deals) | Customer | Default landing |
| `/account/membership` | My Membership (plan, status, expiry, renewal, history, upgrade) | Customer | |
| `/account/my-qr` | Digital membership card + dynamic QR (signed short-lived token) | Customer + **active membership** | Never render PII inside QR payload |
| `/account/saved` | Saved deals & businesses (tabs) | Customer | `/account/saved` per spec |
| `/account/vouchers` | Voucher wallet (Available / Redeemed / Expired / Cancelled; each card shows code, QR, value, expiry) | Customer | |
| `/account/rewards` | Rewards (available / lifetime / redeemed points, points ledger) | Customer | |
| `/account/wallet` | Wallet (balance, ledger history) | Customer | |
| `/account/cashback` | Cashback (available / pending / lifetime; statuses Pending/Approved/Available/Redeemed/Rejected/Expired) | Customer | |
| `/account/referrals` | Referrals (code, URL, copy/share buttons, invited/pending/successful, earnings) | Customer | |
| `/account/redemptions` | Redemption history (deal, business, bill, discount, saving, date, receipt) | Customer | |
| `/account/savings` | Savings history (totals by month/year/category, charts) | Customer | |
| `/account/notifications` | Notification center (in-app list, preferences) | Customer | |
| `/account/profile` | Profile (name, phone, city, avatar) | Customer | |
| `/account/security` | Security (password change, sessions, 2FA/OTP-ready) | Customer | |
| `/account/support` | Support tickets (create, list, thread view) | Customer | |

Mobile: bottom tab navigation (Home, Deals, Saved, My QR, Account). Desktop: left sidebar + top header.

---

## 3. Business Partner Portal `(partner)` — `/partner/dashboard`

| URL | Section | Auth (role) |
|---|---|---|
| `/partner/dashboard` | Overview (active deals, today's redemptions/revenue/discount, KPIs + charts) | Owner, Manager, Cashier, Scanner Operator |
| `/partner/dashboard/scanner` | QR scanner (camera; validate token → bill input → confirm → receipt). **Primary action, always visible** | Owner, Manager, Cashier, Scanner Operator (`redemption.scan`) |
| `/partner/dashboard/deals` | Deal list (status, views, redemptions) | Owner, Manager |
| `/partner/dashboard/deals/new` | Create deal | Owner, Manager (`deal.create`) |
| `/partner/dashboard/deals/[id]` | Edit / duplicate / submit / pause deal | Owner, Manager |
| `/partner/dashboard/vouchers` | Partner vouchers issued | Owner, Manager |
| `/partner/dashboard/redemptions` | Redemption log + receipts | Owner, Manager, Cashier |
| `/partner/dashboard/customers` | Unique/repeat customers | Owner, Manager |
| `/partner/dashboard/profile` | Business profile (info, logo/cover, hours, socials) | Owner, Manager |
| `/partner/dashboard/branches` | Branch management (CRUD branches, assign deals to branches) | Owner, Manager |
| `/partner/dashboard/reviews` | Reviews (read, respond) | Owner, Manager |
| `/partner/dashboard/analytics` | Analytics (redemptions, customers, revenue, discounts, views) | Owner, Manager |
| `/partner/dashboard/staff` | Staff management + roles/permissions | Owner (`staff.manage`) |
| `/partner/dashboard/settlements` | Settlement records (period, gross, commission, net, status) | Owner, Manager |
| `/partner/dashboard/notifications` | Notifications | All staff roles |
| `/partner/dashboard/support` | Support tickets | All staff roles |
| `/partner/dashboard/settings` | Business settings | Owner |

---

## 4. Super Admin Panel `(admin)` — `/admin`

| URL | Module | Notes |
|---|---|---|
| `/admin` | Dashboard (KPI cards, charts, date-range filter) | Dense data UI, no marketing visuals |
| `/admin/users` | User management (search/filter, suspend/reactivate, 360° view) | |
| `/admin/users/[id]` | User detail (profile, membership, rewards, wallet, cashback, referrals, payments, redemptions, savings, login activity) | |
| `/admin/businesses` | Business management (approve/reject/verify/suspend) | |
| `/admin/businesses/[id]` | Business detail (owner, branches, deals, staff, redemptions, reviews, analytics, settlements) | |
| `/admin/applications` | Partner application queue (statuses: Draft → Submitted → Under Review → Approved / Rejected / More Information Required) | |
| `/admin/applications/[id]` | Application review (documents, decision form) | |
| `/admin/branches` | All branches across businesses | |
| `/admin/categories` | Category management (CRUD, icons/images, ordering, enable/disable) | |
| `/admin/deals` | Deal management + approval queue (Draft / Pending Approval / Approved / Published / Paused / Rejected / Expired) | |
| `/admin/deals/[id]` | Deal review (preview, approve/reject/request changes) | |
| `/admin/vouchers` | Voucher catalog + issuance | |
| `/admin/membership-plans` | Membership plan builder | |
| `/admin/memberships` | Active memberships (assign/extend/cancel with audit) | |
| `/admin/redemptions` | Redemption log + fraud flags | |
| `/admin/rewards` | Rewards config + points adjustments (ledger) | |
| `/admin/wallet` | Wallet adjustments (ledger, confirmation modal) | |
| `/admin/cashback` | Cashback queue (approve/reject pending) | |
| `/admin/referrals` | Referral program overview + rewards | |
| `/admin/payments` | Payments (statuses Pending/Paid/Failed/Refunded/Partially Refunded/Cancelled; manual receipt verification) | |
| `/admin/commissions` | Commission rules (global / category / business; % or fixed) | |
| `/admin/settlements` | Settlements (Pending/Processing/Paid/Disputed) | |
| `/admin/reviews` | Review moderation | |
| `/admin/notifications` | Notification log | |
| `/admin/campaigns` | Notification campaigns (audience targeting, scheduling, sent/delivered/opened/clicked) | |
| `/admin/banners` | Banner management (placements, dates, priority) | |
| `/admin/cms` | CMS pages (rich-text editor) | |
| `/admin/reports` | Reports (membership sales, payments, redemptions, savings, business performance, rewards, cashback, referrals, commissions, settlements; CSV export, PDF-ready) | |
| `/admin/analytics` | Platform analytics | |
| `/admin/support` | Support tickets (Open / In Progress / Waiting for Customer / Resolved / Closed) | |
| `/admin/staff` | Admin staff management | |
| `/admin/roles` | Roles & permissions matrix | |
| `/admin/audit-logs` | Audit log (actor, action, entity, old/new values, IP, UA, timestamp) | |
| `/admin/settings` | Platform settings (brand, theme, currency, timezone, payments, notifications, SEO, membership/reward/referral/cashback/commission rules) | |

---

## 5. Error / Utility Routes

| URL | Purpose |
|---|---|
| `/404`, `/500` | Friendly error pages |
| `/maintenance` | Maintenance page |
| `/offline` | Offline/error state (PWA-ready) |

## Sitemap / Robots

- `/sitemap.xml` — generated dynamically (deals, businesses, categories, cities, CMS pages); excluded: auth, account, partner, admin, checkout, payment result pages.
- `/robots.txt` — allow public; disallow `/account`, `/partner/dashboard`, `/admin`, `/checkout`, `/api/`.
