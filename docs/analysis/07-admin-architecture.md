# Bachatly — Super Admin Panel Architecture (`/admin`)

## 1. Design Principles

- **Data density over marketing visuals**: compact tables, KPI cards, charts, filters — no hero sections.
- Layout: persistent **sidebar** (collapsible, grouped modules) + **topbar** (global search, notifications, admin profile, environment badge) + **breadcrumbs** on every page.
- Every destructive/sensitive action → **confirmation modal** showing: action, affected account/entity, amount (if any), mandatory **reason field** → API validates reason → `AuditLog` entry.
- RBAC-gated UI: sidebar items and buttons render only if the admin staff role holds the permission; API re-checks everything (see `02-roles-permissions.md`).

## 2. Sidebar Modules

Dashboard · Users · Businesses · Partner Applications · Branches · Categories · Deals · Vouchers · Membership Plans · Memberships · Redemptions · Rewards · Wallet · Cashback · Referrals · Payments · Commissions · Settlements · Reviews · Notifications · Campaigns (notification campaigns) · Banners · CMS · Reports · Analytics · Support · Admin Staff · Roles & Permissions · Audit Logs · Settings.

## 3. Dashboard (`/admin`)

### KPI cards
Total Users · Active Members · New Members (period) · Total Businesses · Pending Businesses · Active Deals · Total Redemptions · Total Customer Savings (Rs.) · Membership Revenue (Rs.) · Voucher Revenue · Cashback Issued · Referral Rewards.

### Charts
User growth · Membership sales · Revenue · Redemptions · Savings · Business growth (line/bar; Chart component).

### Date filter (global)
Today · Yesterday · 7 Days · 30 Days · This Month · Last Month · Custom Range — applies to all KPIs/charts; timezone Asia/Karachi.

## 4. Data Table Standards (all admin tables)

Every table supports: **search** (debounced), **filters** (status, category, city, date), **sorting** (whitelisted columns), **pagination** (page size selectable), **column visibility** toggle, **export** (CSV; PDF-ready), **date-range** picker. Row click → detail drawer/page. Bulk actions where safe (approve deals, moderate reviews) with confirmation.

## 5. Key Module Designs

### Users (`/admin/users`, `/admin/users/[id]`)
Search/filter (status, city, membership); suspend/reactivate (reason required). Detail 360° view tabs: Profile · Membership (+ history) · Rewards (ledger) · Wallet (ledger) · Cashback · Referrals · Payments · Redemptions · Savings · Login activity (sessions).

### Businesses & Applications
- `/admin/applications`: queue with status filter (Draft / Submitted / Under Review / More Information Required / Approved / Rejected); SLA indicator.
- `/admin/applications/[id]`: applicant info, documents viewer, business details; decision form (Approve / Reject / Request info) with reason/notes; stores reviewed-by/at.
- `/admin/businesses`: create, edit, verify badge, suspend/reactivate. Detail: owner, branches, deals, staff, redemptions, reviews, analytics, settlements.

### Deals (`/admin/deals`, `/admin/deals/[id]`)
Approval queue (**Pending Approval** default filter); preview exactly as customer sees it; actions: **Approve / Reject / Request Changes / Edit** (if permitted), each with notes; stores reviewed-by, date, reason. Lifecycle states: Draft → Pending Approval → Approved → Published ⇄ Paused → Rejected / Expired.

### Memberships
- `/admin/membership-plans`: plan builder (name, description, regular/sale price in Rs., duration, benefits, cashback %, points multiplier, eligible categories/businesses, featured, status).
- `/admin/memberships`: assign manually, extend, cancel — **every change logged** to `MembershipHistory` + `AuditLog`, reason required.

### Financial modules
- **Payments** (`/admin/payments`): statuses Pending / Paid / Failed / Refunded / Partially Refunded / Cancelled; gateway, transaction ID; manual receipt verification (approve → activates membership; reject → notify with reason). Refund → confirmation modal + audit.
- **Cashback** (`/admin/cashback`): approve/reject pending queue; statuses Pending / Approved / Available / Redeemed / Rejected / Expired.
- **Wallet** (`/admin/wallet`) & **Rewards** (`/admin/rewards`): adjustment flows write immutable ledger rows (never edit history); reason required.
- **Commissions** (`/admin/commissions`): rules — global / category / business; percentage or fixed; effective-date versioning.
- **Settlements** (`/admin/settlements`): Pending → Processing → Paid / Disputed; shows gross, commission, adjustments, net (Rs.); disputes handled via adjustment rows.

### Redemptions & fraud (`/admin/redemptions`)
Full log with filters (business, branch, staff, date, status); calculation snapshot viewer (bill → discount → saving); **fraud flags** panel (repeated QR attempts, excessive redemptions, multiple accounts, referral abuse, voucher reuse, unusual activity) — advisory only; actions require human review; **no auto-blocking** without configurable rules.

### Content & engagement
- **Categories** (`/admin/categories`): CRUD, icon/image upload, drag ordering, enable/disable; unlimited subcategories.
- **Banners** (`/admin/banners`): placements (HomeHero, HomeSecondary, DealsPage, CategoryPage, MembershipPage, Dashboard), desktop+mobile images, dates, priority, status.
- **CMS** (`/admin/cms`): rich-text editor for About/FAQs/Terms/Privacy/Refund/Contact/Partner/Membership pages; draft/publish; SEO fields.
- **Campaigns** (`/admin/campaigns`): audience builder (all users / members / non-members / city / category / expired members / partners / custom list), channel (in-app, push, email; SMS/WhatsApp-ready), scheduling, live stats: sent / delivered / opened / clicked.
- **Reviews** (`/admin/reviews`): moderation queue (approve/hide/reject); config toggle: require redemption before review.

### Support (`/admin/support`)
Ticket queue (Open / In Progress / Waiting for Customer / Resolved / Closed), assignment, SLA badges, reply thread with attachments, internal notes.

### Admin Staff / Roles (`/admin/staff`, `/admin/roles`)
Invite/deactivate staff, assign roles; permission matrix editor (Super Admin only); all changes audit-logged.

### Audit Logs (`/admin/audit-logs`)
Filterable by actor, action, entity, date; shows old/new values, IP, user agent. Covers: membership changes, business/deal approvals, payment verification, refunds, wallet/cashback changes, settlement changes, admin permission changes. Append-only.

### Settings (`/admin/settings`) — grouped
Brand (platform name, logo, favicon, colors) · Locale (currency PKR, timezone Asia/Karachi, country, default city) · Contact (email, phone, WhatsApp, socials) · Membership · Rewards · Referral · Cashback · Commission · Payments (gateway toggles, bank name/title/IBAN) · Email · Notifications · SEO.

## 6. Reports (`/admin/reports`)

Membership Sales · Payments · Redemptions · Customer Savings · Business Performance · Rewards · Cashback · Referrals · Commissions · Settlements. All: date filtering, CSV export, PDF-ready layout architecture.

## 7. Confirmation Modal Standard (sensitive actions)

Required for: delete, suspend, refund, membership cancellation, settlement actions, wallet/reward adjustments, permission changes. Modal shows: **action**, **affected account/entity**, **amount** (Rs., if applicable), **reason textarea** (required), consequences summary, and type-to-confirm for irreversible actions.
