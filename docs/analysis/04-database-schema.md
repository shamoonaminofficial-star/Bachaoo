# Bachatly — Database Schema (Prisma / PostgreSQL)

## Global Conventions

- **PKs**: UUID (`@default(uuid())`) on every model.
- **Timestamps**: `createdAt`, `updatedAt` on every model.
- **Soft delete**: `deletedAt` (nullable) on: `User`, `Business`, `Branch`, `Category`, `Subcategory`, `Deal`, `Voucher`, `MembershipPlan`, `Banner`, `CMSPage`, `Review` (moderation hide vs delete), `SupportTicket`. Financial/ledger models (`Payment`, `Redemption`, `WalletTransaction`, `RewardTransaction`, `CashbackTransaction`, `SavingsTransaction`, `AuditLog`, `Settlement`) are **never** soft-deleted — immutable history.
- **Money**: stored as **integer smallest currency unit** — PKR paisa (Rs. 1 = 100 paisa). Display formatted as `Rs. 5,000`. Never floats for money.
- **Decimal-safe rules**: all arithmetic in integers (paisa); percentage math rounds half-up at the final step only; the authoritative calculation happens server-side and a snapshot is stored with each redemption.
- **Ledger rule**: every financial change (wallet, rewards, cashback, savings, commission) writes an immutable ledger transaction row. History rows are never edited; corrections are new reversal/adjustment rows referencing the original.
- **Transactions**: multi-write financial flows (redemption, payment activation, refund, settlement) run in DB transactions.
- **Timezone**: store UTC; display in `Asia/Karachi` by default (per-user setting later).
- **Indexes**: FK columns, `slug` uniques, `(status, cityId)`, `(businessId, status)`, `(userId, createdAt)`, geospatial index on branch/deal lat-lng (PostGIS-ready or `earthdistance`).

---

## 1. Identity & Access

### User
Core account. Fields: `id`, `email` (unique), `phone` (unique, nullable), `passwordHash`, `firstName`, `lastName`, `cityId` (FK, nullable), `referralCode` (unique), `referredById` (FK → User, nullable), `emailVerifiedAt`, `phoneVerifiedAt`, `status` (Active/Suspended/Deleted), `lastLoginAt`, timestamps, `deletedAt`.
Relations: UserProfile, UserRole[], Session[], Membership[], UserVoucher[], Redemption[], Favorite[], Review[], payments, wallet, rewards, cashback, notifications, supportTickets.

### UserProfile
1:1 with User. `avatarUrl`, `dateOfBirth` (nullable), `gender` (nullable), `defaultCityId`, `defaultAreaId`, `notificationPrefs` (JSON), `language`.

### Role / Permission / RolePermission / UserRole
- `Role`: `id`, `name` (unique: Customer, Business Owner, …), `description`, `isSystem`.
- `Permission`: `id`, `key` (unique, `resource.action`), `description`, `group`.
- `RolePermission`: `roleId` + `permissionId` (composite unique).
- `UserRole`: `userId` + `roleId` (+ `businessId` nullable for staff scoping; composite unique).

### Session
`id`, `userId`, `refreshTokenHash`, `deviceInfo`, `ip`, `userAgent`, `expiresAt`, `revokedAt` (nullable). Refresh rotation: old token revoked on use.

---

## 2. Location

- `Country`: `id`, `name`, `code` (PK), `currency` (PKR default), `isActive`.
- `Province`: `id`, `countryId`, `name`.
- `City`: `id`, `provinceId`, `name`, `slug` (unique), `lat`, `lng`, `isActive`.
- `Area`: `id`, `cityId`, `name`, `lat`, `lng`, `isActive`.

## 3. Business Domain

### Business
`id`, `ownerId` (FK → User), `name`, `slug` (unique), `logoUrl`, `coverUrl`, `categoryId`, `description`, `phone`, `whatsapp`, `website`, `instagram`, `facebook`, `isVerified`, `status` (Pending/Active/Suspended/Rejected), `ratingAvg`, `ratingCount`, `commissionOverride` (nullable), timestamps, `deletedAt`.
Relations: branches, deals, staff, reviews, settlements, redemptions.

### BusinessOwner
Link record (a business may have one primary owner user): `id`, `businessId` (unique), `userId`, `verifiedAt`.

### BusinessStaff
`id`, `businessId`, `userId`, `role` (Owner/Manager/Cashier/Scanner Operator), `branchId` (nullable), `isActive`, `invitedBy`, timestamps. Unique (`businessId`, `userId`).

### Branch
`id`, `businessId`, `name`, `managerName`, `phone`, `address`, `cityId`, `areaId`, `latitude`, `longitude`, `openingHours` (JSON: day → open/close), `status` (Active/Inactive), timestamps, `deletedAt`.
Relations: DealBranch[], redemptions.

### Category / Subcategory
- `Category`: `id`, `name`, `slug` (unique), `iconUrl`, `imageUrl`, `sortOrder`, `isActive`, `parentId` (nullable, self-ref for future nesting) — unlimited subcategories supported.
- `Subcategory`: `id`, `categoryId`, `name`, `slug` (unique), `iconUrl`, `imageUrl`, `sortOrder`, `isActive`.

---

## 4. Deals

### Deal
`id`, `businessId`, `categoryId`, `subcategoryId` (nullable), `title`, `slug` (unique), `shortDescription`, `description`, `terms` (rich text), `dealType` (PercentOff/FixedOff/BuyOneGetOne/Freebie/Bundle), `discountPercent` (nullable), `discountAmountPaisa` (nullable), `maxDiscountPaisa` (nullable), `originalPricePaisa` (nullable), `dealPricePaisa` (nullable), `requiresMembership` (bool), `requiredPlanIds` (array/JSON), `startAt`, `endAt`, `daysAvailable` (JSON), `timesAvailable` (JSON), `usageLimitTotal`, `usageLimitPerUser`, `dailyLimitPerUser`, `monthlyLimitPerUser`, `status` (Draft/Pending Approval/Approved/Published/Paused/Rejected/Expired), `reviewedBy`, `reviewedAt`, `reviewNotes`, `viewCount`, `isFeatured`, timestamps, `deletedAt`.
Relations: images, DealBranch[], redemptions, favorites, reviews.

### DealImage
`id`, `dealId`, `url`, `sortOrder`, `alt`.

### DealBranch
`dealId` + `branchId` (composite unique) — "all branches" represented by zero rows + `appliesToAllBranches` bool on Deal.

### Favorite
`id`, `userId`, `favoritableType` (Deal/Business), `favoritableId`, `createdAt`. Unique (`userId`, `favoritableType`, `favoritableId`).

---

## 5. Membership

### MembershipPlan
`id`, `name`, `slug` (unique), `description`, `regularPricePaisa`, `salePricePaisa`, `durationDays`, `benefits` (JSON array), `rewardMultiplier` (decimal as string/ratio), `cashbackPercent`, `eligibleCategoryIds` (JSON), `eligibleBusinessIds` (JSON), `isFeatured`, `status` (Active/Inactive), timestamps, `deletedAt`.

### Membership
`id`, `userId`, `planId`, `membershipNumber` (unique), `status` (Active/Expired/Cancelled/Pending), `startedAt`, `expiresAt`, `paymentId` (nullable), `autoRenew` (bool), timestamps.

### MembershipHistory
Immutable log of every membership change: `id`, `membershipId`, `action` (Created/Renewed/Extended/Cancelled/Assigned/Expired), `actorId`, `reason`, `oldValues` (JSON), `newValues` (JSON), `createdAt`.

---

## 6. Vouchers

### Voucher
Template/definition: `id`, `businessId` (nullable — platform vouchers have none), `title`, `description`, `valuePaisa`, `terms`, `validFrom`, `validTo`, `totalQuantity`, `perUserLimit`, `status` (Active/Inactive), timestamps, `deletedAt`.

### UserVoucher
Issued instance: `id`, `voucherId`, `userId`, `code` (unique), `qrPayload` (signed token ref), `source` (Free/Purchased/Reward/Referral/Promo), `status` (Available/Redeemed/Expired/Cancelled), `redeemedAt`, `expiresAt`, timestamps.

---

## 7. Redemption & Savings

### Redemption
`id`, `userId`, `dealId` (nullable for voucher redemptions → `userVoucherId`), `businessId`, `branchId`, `scannedBy` (staff userId), `billAmountPaisa`, `discountPercent`, `discountAmountPaisa`, `maxDiscountApplied` (bool), `customerPaidPaisa`, `savingPaisa`, **`calculationSnapshot`** (JSON: inputs + rule versions — authoritative), `pointsEarned`, `cashbackPaisa`, `status` (Completed/Voided), `voidedAt`, `voidReason`, `idempotencyKey` (unique), timestamps. Never updated after completion except void (void writes reversal rows).

### SavingsTransaction
Ledger of customer savings: `id`, `userId`, `redemptionId` (unique), `amountPaisa`, `categoryId`, `businessId`, `occurredAt`. Powers total/month/year/category aggregates + charts.

---

## 8. Rewards / Wallet / Cashback

### Reward (points account)
`id`, `userId` (unique), `availablePoints`, `lifetimePoints`, `redeemedPoints`, `updatedAt`.

### RewardTransaction
Immutable points ledger: `id`, `rewardId`, `userId`, `points` (signed int), `type` (Earn/Redeem/Adjust/Expire/Reversal), `source` (Membership/Purchase/Redemption/Referral/Promo/AdminBonus), `referenceId`, `balanceAfter`, `createdAt`.

### Wallet
`id`, `userId` (unique), `balancePaisa`, `updatedAt`.

### WalletTransaction
Immutable money ledger: `id`, `walletId`, `userId`, `amountPaisa` (signed), `type` (Credit/Debit/Adjust/Reversal), `reason`, `referenceId`, `balanceAfter`, `createdAt`.

### Cashback
`id`, `userId`, `redemptionId` (nullable), `amountPaisa`, `status` (Pending/Approved/Available/Redeemed/Rejected/Expired), `approvedBy`, `approvedAt`, `expiresAt`, timestamps.

### CashbackTransaction
Immutable ledger: `id`, `cashbackId`, `userId`, `amountPaisa` (signed), `type` (Accrue/Approve/Release/Redeem/Reject/Expire/Reversal), `balanceAfter`, `createdAt`.

---

## 9. Referrals

### Referral
`id`, `referrerId`, `referredUserId` (unique), `code` (used), `status` (Pending/Qualified/Rewarded/Invalid), `qualifiedAt`, `createdAt`.

### ReferralReward
`id`, `referralId` (unique), `referrerId`, `rewardType` (Points/Cashback/Voucher), `points` (nullable), `amountPaisa` (nullable), `userVoucherId` (nullable), `status` (Pending/Issued), `issuedAt`. Issued only after the configured qualifying event.

---

## 10. Payments & Finance

### Payment
`id`, `userId`, `orderType` (Membership/Voucher), `orderId`, `amountPaisa`, `currency` (PKR), `gateway` (Card/Stripe/BankTransfer/Manual), `gatewayTransactionId` (nullable, unique), `status` (Pending/Paid/Failed/Refunded/PartiallyRefunded/Cancelled), `receiptUrl` (manual), `verifiedBy`, `verifiedAt`, `paidAt`, timestamps. **Never stores card numbers/CVV.**

### PaymentAttempt
Each gateway attempt: `id`, `paymentId`, `gateway`, `requestPayload` (redacted), `responsePayload` (redacted), `status`, `createdAt`.

### Commission
Rule + applied records:
- Rule fields on `SystemSetting` or dedicated `CommissionRule`: `id`, `scope` (Global/Category/Business), `scopeId` (nullable), `type` (Percentage/Fixed), `value`, `isActive`.
- Applied: `Commission` row per eligible transaction: `id`, `redemptionId`/`settlementId`, `businessId`, `amountPaisa`, `ruleId`, `createdAt` (immutable).

### Settlement
`id`, `businessId`, `periodStart`, `periodEnd`, `grossAmountPaisa`, `commissionPaisa`, `adjustmentsPaisa`, `netAmountPaisa`, `status` (Pending/Processing/Paid/Disputed), `paidAt`, `notes`, timestamps. Adjustments are new rows/notes, never edits.

---

## 11. Reviews / Notifications / Content

### Review
`id`, `userId`, `businessId`, `dealId` (nullable), `redemptionId` (nullable — required if admin config demands verified purchase), `rating` (1–5), `text`, `photos` (JSON), `status` (Pending/Published/Hidden/Rejected), `moderatedBy`, timestamps, `deletedAt`.

### Notification
`id`, `userId` (nullable — null = business staff target via businessId), `businessId` (nullable), `type` (enum of events), `channel` (InApp/Push/Email/SMS/WhatsApp), `title`, `body`, `data` (JSON deep-link), `status` (Queued/Sent/Delivered/Opened/Clicked/Failed), `scheduledAt`, `sentAt`, timestamps.

### NotificationCampaign
`id`, `name`, `audience` (JSON: all/members/non-members/city/category/expired/partners/custom), `channel`, `title`, `body`, `scheduledAt`, `status` (Draft/Scheduled/Sending/Sent/Cancelled), `statsSent/Delivered/Opened/Clicked`, `createdBy`, timestamps.

### Banner
`id`, `placement` (HomeHero/HomeSecondary/DealsPage/CategoryPage/MembershipPage/Dashboard), `imageUrl`, `mobileImageUrl`, `heading`, `description`, `ctaText`, `ctaUrl`, `startAt`, `endAt`, `priority`, `status`, timestamps, `deletedAt`.

### CMSPage
`id`, `slug` (unique: about/terms/privacy/refund-policy/contact/partner-info/membership-info), `title`, `content` (rich text/JSON), `metaTitle`, `metaDescription`, `status` (Draft/Published), `updatedBy`, timestamps, `deletedAt`.

---

## 12. Support / Audit / Settings

### SupportTicket / SupportMessage
- `SupportTicket`: `id`, `userId` (nullable for guests), `businessId` (nullable), `category`, `subject`, `description`, `priority`, `status` (Open/InProgress/WaitingForCustomer/Resolved/Closed), `assignedTo`, timestamps, `deletedAt`.
- `SupportMessage`: `id`, `ticketId`, `authorId`, `authorType` (Customer/Staff/Admin), `message`, `attachments` (JSON), `createdAt`.

### AuditLog
Append-only: `id`, `actorId`, `actorRole`, `action`, `entity`, `entityId`, `oldValues` (JSON), `newValues` (JSON), `ip`, `userAgent`, `createdAt`. Covers: membership changes, business/deal approvals, payment verification, refunds, wallet/cashback adjustments, settlement changes, admin permission changes.

### SystemSetting
`id`, `key` (unique), `value` (JSON), `group` (brand/theme/payments/notifications/membership/rewards/referral/cashback/commission/seo), `updatedBy`, `updatedAt`. Stores: platform name, logo, favicon, colors, currency, timezone, country, default city, contact email/phone/WhatsApp, social links, gateway toggles, bank account details (name/title/IBAN), commission defaults.

---

## Key Relationship Summary

- User 1—* : Membership, UserVoucher, Redemption, Favorite, Review, Payment, Notification, SupportTicket; 1—1: UserProfile, Reward, Wallet.
- Business 1—* : Branch, Deal, BusinessStaff, Review, Settlement, Redemption; 1—1: BusinessOwner.
- Deal *—1: Business, Category, Subcategory?; *—*: Branch (via DealBranch); 1—*: DealImage, Redemption.
- Every money/points movement: User → (Wallet|Reward|Cashback) → immutable *Transaction rows.
- Every sensitive admin mutation → AuditLog row.
