# Bachatly — User Journeys

## Journey A — Visitor → Member → Redeem → Savings

1. **Visitor lands on homepage** `/` — sees hero ("Save More. Live More."), search bar ("What are you looking for?"), location selector.
2. **Browses deals** — opens `/deals`, applies filters (category, city, discount %, distance); views deal cards (business, discount, badges like MEMBERS ONLY / TRENDING).
3. **Opens deal detail** `/deal/[slug]` — sees gallery, pricing, terms, map, reviews. Clicks **Redeem Offer**.
4. **Membership gate** — not logged in → redirected to `/login?next=/deal/[slug]`; logged in but no active membership → **Get Membership** interstitial explaining benefits.
5. **Registers** `/register` — first name, last name, phone, email, password, city; accepts Terms & Privacy; email verification sent; phone OTP-ready.
6. **Chooses plan** `/membership` — compares plans (Starter / Premium / Family): price (regular vs sale), duration, benefits, reward multiplier, cashback %.
7. **Checkout** `/checkout/[planSlug]` — selects payment method: card, bank transfer (shows bank name, account title, IBAN), or manual. Reviews order summary in Rs.
8. **Payment**:
   - Card → gateway redirect/callback → server-side verification → membership activated.
   - Bank/manual → uploads receipt → status **Awaiting Verification** → admin approves → membership activated.
9. **Membership activated** — digital membership card issued (membership number, QR), welcome notification (in-app + email; SMS/WhatsApp-ready), referral code generated.
10. **Returns to deal** — clicks **Redeem Offer**; backend eligibility check: logged in ✓, active membership ✓, deal active ✓, business active ✓, not expired ✓, within usage/per-user/daily/monthly limits ✓, required plan tier ✓.
11. **QR generated** — signed short-lived token (60–120s expiry), auto-refreshing; contains no PII, no raw user/deal/membership IDs.
12. **At business** — partner scans QR with `/partner/dashboard/scanner`; backend validates signature, expiry, single-use (replay prevented).
13. **Bill entered** — partner inputs bill amount, e.g. Rs. 5,000; **server computes**: 20% discount → saving Rs. 1,000 → customer pays Rs. 4,000; max-discount cap applied if configured.
14. **Partner confirms** — redemption recorded in a DB transaction: `Redemption` + `SavingsTransaction` + reward points + cashback (per plan rules). Receipt generated.
15. **Customer dashboard updated** — `/account` shows new Total Savings, points, cashback pending; redemption appears in `/account/redemptions`; notification "You saved Rs. 1,000".

### Edge cases — Journey A
| Edge case | Handling |
|---|---|
| Membership gate | Clear "Members only" state on deal page with benefits + Get Membership CTA; preserve `next` URL. |
| Payment failure | `/payment/failed` with reason, retry button, order kept in `Pending`; no membership created; `PaymentAttempt` logged. |
| Manual payment pending | Status page explains verification within X hours; notification on approval/rejection. |
| QR expiry (60–120s) | Auto-refresh token; scanner shows "QR expired — ask customer to refresh"; expired tokens rejected server-side. |
| Screenshot/replay | Token is single-use + short-lived + signed; reuse attempt → rejected + fraud flag. |
| Redemption limit reached | Pre-check blocks QR generation with message ("You've used this offer 2/2 times"). |
| Deal expired between view and scan | Revalidated at scan time; graceful "offer no longer available". |
| Duplicate scan (double-click) | Idempotency key on confirm; DB unique constraint on token. |
| Offline scanner | Camera scan requires connectivity; clear offline error state (no offline redemption). |

---

## Journey B — Partner Application → Deal Published

1. **Business visits** `/partner` — reads benefits (reach, marketing, analytics), clicks **Become a Partner**.
2. **Application** `/partner/apply` — submits: business name, owner name, email, phone, WhatsApp, category, city, area, full address, Google Maps location, website, Instagram, Facebook, description; uploads business documents, owner ID, logo. Status: **Submitted** (editable while **Draft**).
3. **Admin review** `/admin/applications/[id]` — admin checks documents, may request **More Information Required** (applicant notified, resubmits) or **Approve / Reject** with reason. Decision + reviewer + timestamp stored.
4. **Approved** — business record created, owner account linked (`Business Owner` role), welcome notification; partner logs into `/partner/dashboard`.
5. **Sets up profile** — completes business info, adds **branches** (name, manager, phone, address, city, area, lat/lng, hours, status).
6. **Creates deal** `/partner/dashboard/deals/new` — title, descriptions, images, category/subcategory, deal type, discount, original/deal price, membership requirement, branches (all or selected), dates, days/times, usage & per-user limits, terms. Saved as **Draft**.
7. **Submits for approval** — status → **Pending Approval**; admin notified.
8. **Admin deal review** `/admin/deals/[id]` — preview, then **Approve / Reject / Request Changes** (with reason/notes). Stored: reviewed by, date, reason.
9. **Deal published** — status → **Published**; appears on `/deals`, business profile, search; partner sees views/redemptions in dashboard.
10. **Customer redeems** (Journey A steps 10–15) → partner scans, confirms → analytics update.
11. **Settlement** — period closes; admin/partner view settlement (gross, commission, net, status Pending → Processing → Paid); partner can dispute.

### Edge cases — Journey B
| Edge case | Handling |
|---|---|
| Incomplete application | Draft autosave; validation checklist before submit. |
| Rejected application | Reason shown; may re-apply. |
| Deal changes requested | Status back to Draft with admin notes; resubmission allowed. |
| Deal paused by partner | Immediately hidden from listings; existing QR tokens for it invalidated. |
| Branch closed | Deals scoped to that branch auto-paused; customers notified if saved. |
| Staff misuse | Cashier cannot edit deals; all scans tied to staff user in audit. |

---

## Journey C — Admin Approval & Monitoring Flow

1. **Admin opens dashboard** `/admin` — KPI cards (total users, active members, pending businesses, active deals, redemptions, savings, revenue) with date filter (Today / 7d / 30d / custom).
2. **Partner application queue** `/admin/applications` — filters by status; opens application; verifies documents; approves/rejects/requests info (reason required for reject).
3. **Deal approval queue** `/admin/deals` — filter **Pending Approval**; previews deal as customer would see it; approves / rejects / requests changes with notes.
4. **Payment monitoring** `/admin/payments` — watches failed payments; verifies **manual/bank receipts** (approve → membership activates; reject → customer notified with reason).
5. **Redemption monitoring** `/admin/redemptions` — reviews volume, anomalies, fraud flags (repeated QR attempts, excessive redemptions, referral abuse); investigates before any action — **no automatic blocking** without configurable rules.
6. **Financial oversight** — approves pending cashback `/admin/cashback`; reviews wallet/reward adjustments (each with confirmation modal + reason + audit log); manages settlements `/admin/settlements` (Pending → Processing → Paid / Disputed).
7. **Campaigns** `/admin/campaigns` — targets audience (all users / members / expired members / city / category), schedules notification (in-app, push, email; SMS/WhatsApp-ready), tracks sent/delivered/opened/clicked.
8. **Content** — manages categories, banners, CMS pages `/admin/cms`, moderates reviews `/admin/reviews`.
9. **Reports** `/admin/reports` — membership sales, payments, redemptions, savings, business performance, rewards, cashback, referrals, commissions, settlements; date filtering; CSV export; PDF-ready.
10. **Audit** `/admin/audit-logs` — verifies who did what (membership changes, approvals, refunds, wallet/cashback/settlement changes, permission changes).

### Edge cases — Journey C
| Edge case | Handling |
|---|---|
| Fraud flag false positive | Flags are advisory; action requires human review + reason. |
| Disputed settlement | Status → **Disputed**; adjustments recorded as new ledger entries, never edits. |
| Refund after redemption | `redemption.void` reverses derived rewards/cashback/savings via reversal transactions. |
| Permission escalation attempt | Denied + audit-logged; `role.manage` restricted to Super Admin. |
