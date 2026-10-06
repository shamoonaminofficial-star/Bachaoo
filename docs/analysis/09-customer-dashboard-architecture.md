# Bachatly — Customer Dashboard Architecture (`/account`)

## 1. Layout & Navigation

- **Desktop**: left sidebar + top header (search, location, notifications bell, avatar) + main content.
- **Mobile**: bottom tab bar (Home · Deals · **My QR** · Saved · Account) — app-like feel; sidebar sections become grouped list pages; filters open in `BottomSheet`s; tables collapse to cards.
- All sections require the `Customer` role; **My QR / redeem flows** additionally require an **active membership** (server-checked; graceful upsell state otherwise).
- Currency Rs., timezone Asia/Karachi; skeleton-first loading; empty states with CTAs everywhere.

## 2. Overview (`/account`)

Welcome message (first name) · membership status card (plan, **expiry date**, renew CTA) · stat cards: **Total Savings** (Rs.), **Reward Points**, **Cashback Balance** (Rs.), Available Vouchers, Deals Redeemed, Referral Earnings (Rs.) · Recent Activity timeline · Recommended Deals (`DealCard` grid).

## 3. My Membership (`/account/membership`)

Current plan (name, membership number, joined, expiry, status, auto-renew toggle) · plan benefits list · upgrade/downgrade/renew CTAs → `/checkout/[planSlug]` · membership history (from `MembershipHistory`: renewals, extensions, cancellations with reasons).

## 4. My QR — Digital Membership Card (`/account/my-qr`)

Premium card showing: customer **name**, membership **number**, membership **type**, joining date, expiry, status badge. Below: **dynamic QR code** (auto-refreshing).

### QR security rules
- QR encodes a **signed short-lived token** (JWS, 60–120s expiry), **not** a user/deal/membership ID.
- **No PII inside the QR payload** — only opaque references; customer first name is resolved server-side at scan time.
- Single-use `jti` (replay/screenshot reuse rejected + fraud-flagged); token refresh countdown shown; "show at counter only" hint.
- Lost/stolen device: membership can be frozen from Security; outstanding tokens invalidated.

## 5. Saved Deals (`/account/saved`)

Tabs: **Deals** / **Businesses**; cards with unfavorite; empty state → Explore Deals CTA. Saved-deal alerts: push/email when a saved deal is ending soon or a saved business posts a new deal.

## 6. My Vouchers (`/account/vouchers`)

Filter by status: **Available / Redeemed / Expired / Cancelled**. Voucher card: title, business, value (Rs.), **code**, QR, expiry, status badge, T&Cs. Sources: Free, Purchased, Reward-based, Promotional, Referral reward. Actions: **Redeem** (generates single-use QR like deals), gift info, view receipt for redeemed.

## 7. Rewards (`/account/rewards`)

Headline: **Available points · Lifetime points · Redeemed points**. Points **ledger** (every change = `RewardTransaction` row: earn/redeem/adjust/expire with source). Earn sources: membership purchase/renewal, redemptions, referrals, promo campaigns, admin bonuses. CTA: **Rewards Marketplace** (`/rewards`) — exchange points for vouchers/deals/coupons with required points shown clearly; exchange writes ledger + issues `UserVoucher`.

## 8. Wallet (`/account/wallet`)

Balance (Rs.) · immutable **transaction ledger** (credit/debit/adjust/reversal with running `balanceAfter`). Wallet used for: referral cash rewards (configurable), admin credits, marketplace change. No direct top-up at launch (architecture-ready).

## 9. Cashback (`/account/cashback`)

Headline: **Available · Pending · Lifetime** cashback (Rs.). Status pipeline: **Pending → Approved → Available → Redeemed**, with **Rejected** / **Expired** terminal states. Transaction history (`CashbackTransaction` ledger). Redeem action moves Available → Redeemed (to wallet or voucher, per config); expiry dates shown with warnings.

## 10. Referrals (`/account/referrals`)

Referral **code** + **URL** with copy button + share sheet (**WhatsApp / Facebook / X / Email / Copy Link**). Stats: invited users, **pending** referrals, **successful** referrals, reward earned (Rs./points). Timeline of referral events. Note: reward issues only after the **configured qualifying event** (e.g. referee's first paid membership + first redemption) — shown transparently ("Reward unlocks when your friend completes their first redemption").

## 11. Redemption History (`/account/redemptions`)

Chronological list: deal/business/branch, date, bill (Rs.), discount %, **saving (Rs.)**, receipt view. Filter by date/category/business. Each receipt shows the server-computed snapshot (bill → discount → paid → saved).

## 12. Savings History (`/account/savings`)

Per-redemption record: **original bill, discount %, discount amount, customer paid, customer saving** (Rs.). Aggregates + **charts**: Total Savings · Savings This Month · Savings This Year · **Savings by Category** (donut) · savings trend (line). "You Save Rs. X" shown only where accurately calculable.

## 13. Notifications (`/account/notifications`)

In-app center (all types: welcome, membership purchased/expiring/expired, new deal, deal ending, voucher received/expiring, cashback credited, points earned, referral successful, payment successful, partner approved) with read/unread, deep links; **preferences** page (channel toggles: in-app, push, email; SMS/WhatsApp-ready toggles behind flags).

## 14. Profile / Security / Support

- **Profile** (`/account/profile`): name, phone, city/area, avatar, notification prefs shortcut.
- **Security** (`/account/security`): change password, active sessions (revoke), OTP/phone verification status (OTP-ready), freeze membership card.
- **Support** (`/account/support`): ticket list + create (category, description, attachments) + thread view; statuses Open / In Progress / Waiting for Customer / Resolved / Closed.

## 15. Cross-Cutting Rules

- Every money figure from server-side snapshots (never client-computed); amounts in paisa, rendered as `Rs.`.
- Membership expiry drives: QR issuance, redeem eligibility, "expiring soon" nudges (7/3/1-day notifications), renewal upsell.
- Logout clears tokens + revokes `Session`; audit covers membership/security changes.
