# Bachatly — Business Partner Portal Architecture (`/partner`)

## 1. Portal Principles

- Separate secure area from the public site and customer dashboard; staff authenticate and are scoped to **their own business** (ownership guard on every API call).
- **Primary action always visible**: big **Scan QR** button in sidebar + dashboard hero + mobile bottom nav — scanning is the core job.
- Role-aware UI: Cashier/Scanner Operator see a scanner-first simplified layout; Owner/Manager see the full sidebar.
- Currency Rs., timezone Asia/Karachi throughout.

## 2. Application Flow (`/partner/apply` → approval)

| Stage | Status | What happens |
|---|---|---|
| Applicant fills form | `Draft` | Autosave; fields: business name, owner name, email, phone, WhatsApp, category, city, area, full address, Google Maps location, website, Instagram, Facebook, description; uploads: business documents, owner ID, logo. |
| Submits | `Submitted` | Validation checklist; confirmation; reference number shown. |
| Admin triage | `Under Review` | Admin checks documents at `/admin/applications/[id]`. |
| Needs clarity | `More Information Required` | Applicant notified (in-app + email), resubmits; back to Under Review. |
| Decision | `Approved` / `Rejected` | Approved → Business record + Owner account created, welcome pack; Rejected → reason shown, may re-apply. |

## 3. Portal IA (`/partner/dashboard/*`)

Overview · **QR Scanner** · Deals · Vouchers · Redemptions · Customers · Business Profile · Branches · Reviews · Analytics · Staff · Settlements · Notifications · Support · Settings.

## 4. Dashboard (`/partner/dashboard`)

### KPI cards
Active Deals · Total Redemptions · **Today's Redemptions** · Unique Customers · Total Discount Given (Rs.) · Estimated Revenue Generated (Rs.) · Profile Views · Deal Views.

### Charts
Redemptions (line) · Customers new vs repeat (bar) · Revenue vs discount (combo) · Top deals (table). Date filter: Today / 7d / 30d / custom.

### Today's strip
Today's Redemptions · Today's Revenue · Today's Discount Given — glanceable at open.

## 5. Branch Management (`/partner/dashboard/branches`)

CRUD per branch: name, manager, phone, address, city, area, latitude/longitude, opening hours, status (Active/Inactive). Deals target **all branches** or **selected branches** (`DealBranch`). Deactivating a branch pauses its scoped deals and notifies affected customers.

## 6. Deal Lifecycle (`/partner/dashboard/deals`)

**Draft → Pending Approval → Approved → Published ⇄ Paused → Rejected / Expired**

- **Create** (`/deals/new`): title, short + full description, images, category/subcategory, deal type, discount (%, fixed, BOGO), original/deal price (Rs.), max-discount cap, membership requirement (tier), branches, start/end date, days & times available, total/per-user/daily/monthly limits, terms.
- Actions: Edit, **Duplicate**, **Submit for Approval**, **Pause** (instant hide; invalidates outstanding QR tokens for the deal), Resume.
- Admin decision (approve/reject/request changes with notes) returns to partner inbox; rejected deals show reason and can be edited + resubmitted.
- **Expired**: automatic by `endAt`; listed under Expired with clone-to-new option.

## 7. Browser-Based QR Scanner (`/partner/dashboard/scanner`)

### Flow
1. **Open scanner** — requests camera permission (graceful fallback: manual token entry if camera unavailable/denied).
2. **Scan customer QR** — token sent to `POST /api/v1/redemptions/validate`.
3. **Backend validates**: signature (JWS, `QR_SIGNING_SECRET`) → expiry (60–120s) → single-use `jti` (Redis + DB) → deal/business/branch still active → customer membership active → limits not exceeded.
4. **Display**: customer **first name only**, membership status/plan, deal title, discount terms.
5. **Bill input** — partner enters bill amount (Rs.), e.g. Rs. 5,000.
6. **Server computes** (never frontend): discount 20% → saving Rs. 1,000 → customer pays Rs. 4,000; max-discount cap applied; cashback & points derived per plan rules; snapshot stored.
7. **Confirm screen** — shows breakdown; partner taps **Confirm** (idempotency key).
8. **Receipt generated** — redemption ID, timestamp, business/branch, bill, discount, saving, staff name; printable/shareable; customer notified ("You saved Rs. 1,000").

### Scanner error states
Expired QR ("ask customer to refresh") · Already used (replay → rejected + fraud flag) · Deal paused/expired (revalidated live) · Membership inactive · Limit reached · Offline (clear message; no offline redemption).

## 8. Staff Roles & Permissions (`/partner/dashboard/staff`)

| Capability | Owner | Manager | Cashier | Scanner Operator |
|---|---|---|---|---|
| Scan & confirm redemptions | ✓ | ✓ | ✓ | ✓ |
| View redemptions/customers | ✓ | ✓ | own shift | – |
| Create/edit deals | ✓ | ✓ | – | – |
| Manage branches/profile | ✓ | ✓ | – | – |
| Respond to reviews | ✓ | ✓ | – | – |
| View settlements | ✓ | ✓ | – | – |
| Manage staff & roles | ✓ (owner only) | – | – | – |
| Business settings | ✓ (owner only) | – | – | – |

Staff invite via email/phone; each scan/confirm is attributed to the staff user in `AuditLog`/`Redemption.scannedBy`. Cashier explicitly **cannot** modify deals, branches, or financial/settlement data.

## 9. Analytics (`/partner/dashboard/analytics`)

Deal views · Profile views · Redemptions · Unique vs repeat customers · Average bill (Rs.) · Discount given (Rs.) · Estimated revenue (Rs.) · Redemption by day/hour heatmap · Top branches. Export CSV.

## 10. Settlements (`/partner/dashboard/settlements`)

Settlement cards/table: Settlement ID, period, gross (Rs.), commission, adjustments, **net (Rs.)**, status (Pending / Processing / **Paid** / Disputed); dispute action with reason; payout history.

## 11. Reviews / Notifications / Support / Settings

- **Reviews**: list, rating summary, respond publicly; report abuse.
- **Notifications**: deal approvals, redemptions, settlement updates, campaign messages.
- **Support**: create/track tickets (Open → Resolved).
- **Settings** (Owner): payout/bank details, notification prefs, business verification documents.
