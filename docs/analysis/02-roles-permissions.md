# Bachatly — Roles & Permissions

## 1. Role Definitions

### Customer-side
| Role | Scope | Description |
|---|---|---|
| `Customer` | Self | Registered customer; buys memberships, saves/redeems deals, earns rewards/cashback, refers friends. |

### Business staff (per business)
| Role | Scope | Description |
|---|---|---|
| `Business Owner` | Own business | Full control: profile, branches, deals, vouchers, staff, settlements, settings. |
| `Business Manager` | Own business | Deals, branches, analytics, settlements, reviews; cannot manage staff or settings. |
| `Cashier` | Own business (branch) | Scans QR, confirms redemptions, views redemption log. Cannot modify deals/finances. |
| `Scanner Operator` | Own business (branch) | QR scanning only (most restricted). |

### Platform admin staff
| Role | Scope | Description |
|---|---|---|
| `Support Agent` | Platform | Support tickets, user lookup, no financial changes. |
| `Content Manager` | Platform | Categories, banners, CMS pages, deal content review (no approve). |
| `Finance Manager` | Platform | Payments, refunds, cashback approval, settlements, commissions. |
| `Marketing Manager` | Platform | Campaigns, banners, CMS promos, rewards config (non-financial). |
| `Administrator` | Platform | Broad operational access except role/permission management and destructive system actions. |
| `Super Admin` | Platform | Full access: roles, permissions, admin staff, settings, audit. |

---

## 2. Permission Catalog (`resource.action`)

### Users
`user.read`, `user.update`, `user.suspend`, `user.impersonate` *(Super Admin only, audit-logged)*

### Business & partner
`business.read`, `business.create`, `business.update`, `business.approve`, `business.verify`, `business.suspend`, `branch.read`, `branch.create`, `branch.update`, `branch.delete`, `application.read`, `application.review`

### Deals
`deal.read`, `deal.create`, `deal.update`, `deal.delete`, `deal.submit`, `deal.approve`, `deal.publish`, `deal.pause`

### Vouchers
`voucher.read`, `voucher.create`, `voucher.update`, `voucher.issue`, `voucher.revoke`

### Membership
`membershipplan.read`, `membershipplan.create`, `membershipplan.update`, `membershipplan.delete`, `membership.read`, `membership.assign`, `membership.extend`, `membership.cancel`

### Redemptions
`redemption.read`, `redemption.scan`, `redemption.confirm`, `redemption.void` *(Finance/Administrator+, audit-logged)*

### Rewards / wallet / cashback / referrals
`reward.read`, `reward.adjust` *(Finance+, ledger entry, confirmation modal)*, `wallet.read`, `wallet.adjust`, `cashback.read`, `cashback.approve`, `cashback.reject`, `referral.read`, `referralreward.issue`

### Payments / commissions / settlements
`payment.read`, `payment.verify` *(manual receipts)*, `payment.refund`, `commission.read`, `commission.manage`, `settlement.read`, `settlement.manage`

### Reviews
`review.read`, `review.moderate`, `review.reply` *(business staff, own business)*

### Notifications / campaigns / banners / CMS
`notification.read`, `notification.send`, `campaign.create`, `campaign.send`, `banner.read`, `banner.manage`, `cms.read`, `cms.update`

### Support / reports / analytics
`support.read`, `support.reply`, `support.assign`, `report.read`, `report.export`, `analytics.read`

### Admin system
`adminstaff.read`, `adminstaff.manage`, `role.read`, `role.manage`, `permission.manage`, `settings.read`, `settings.update`, `auditlog.read`, `admin.manage`

### Customer self-service (implicit to `Customer` role)
`profile.update`, `favorite.manage`, `review.create`, `support.create`, `membership.purchase`, `redemption.request`

---

## 3. Permission Matrix (role × key permissions)

| Permission | Customer | Owner | Manager | Cashier | Scanner | Support | Content | Finance | Marketing | Admin | Super Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| user.read | self | – | – | – | – | ✓ | – | ✓ | – | ✓ | ✓ |
| user.suspend | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| business.approve | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| business.suspend | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| deal.approve | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| deal.create/update (own business) | – | ✓ | ✓ | – | – | – | – | – | – | – | – |
| redemption.scan / .confirm | – | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| redemption.void | – | – | – | – | – | – | – | ✓ | – | ✓ | ✓ |
| payment.verify / payment.refund | – | – | – | – | – | – | – | ✓ | – | ✓ | ✓ |
| wallet.adjust / reward.adjust | – | – | – | – | – | – | – | ✓ | – | ✓ | ✓ |
| cashback.approve | – | – | – | – | – | – | – | ✓ | – | ✓ | ✓ |
| membership.assign / .cancel | – | – | – | – | – | – | – | – | – | ✓ | ✓ |
| cms.update / banner.manage | – | – | – | – | – | – | ✓ | – | ✓ | ✓ | ✓ |
| campaign.send | – | – | – | – | – | – | – | – | ✓ | ✓ | ✓ |
| role.manage / adminstaff.manage | – | – | – | – | – | – | – | – | – | – | ✓ |
| staff.manage (own business) | – | ✓ | – | – | – | – | – | – | – | – | – |
| settings.update | – | – | – | – | – | – | – | – | – | – | ✓ |
| auditlog.read | – | – | – | – | – | – | – | ✓ | – | ✓ | ✓ |

Legend: – = denied. Business staff permissions are automatically scoped to their own business (ownership check in addition to permission check).

---

## 4. How RBAC + Permissions Combine

1. **User → Roles** (`UserRole`): a user may hold multiple roles (e.g. a `Customer` who is also a `Business Owner` of a business).
2. **Role → Permissions** (`RolePermission`): effective permissions = union of all assigned roles' permissions.
3. **Scope check** (second layer): business staff permissions apply only to their own business/branch — enforced by an ownership guard (`BusinessStaff.businessId`), not by permission alone.
4. **Deny by default**: any action without an explicit permission grant is denied.
5. **Permission changes are audited**: `role.manage`, `permission.manage`, `adminstaff.manage` all write to `AuditLog`.
6. **Frontend gating**: UI hides/disables unauthorized controls, but **the API is the authority** — every endpoint re-checks.

## 5. Guard Strategy

### Next.js (frontend)
- Route groups `(account)`, `(partner)`, `(admin)` wrapped in server-side auth checks; unauthenticated → `/login?next=...`; wrong role → `/403` or role home.
- `requireRole()` / `requirePermission()` helpers in server components and middleware; JWT validated via httpOnly cookie or Authorization header.
- Partner routes additionally verify `BusinessStaff` membership; Cashier/Scanner get scanner-first layout.
- Membership-gated actions (Redeem) check `membership.status === 'active'` server-side before rendering the QR step.

### NestJS (API)
- Global `JwtAuthGuard` + `PermissionsGuard`; decorators: `@Roles('Business Owner')`, `@RequirePermissions('deal.approve')`, `@OwnBusiness()` for scoping.
- Guard order: Authentication → Role → Permission → Ownership scope → Resource state (e.g. deal is `Published`).
- All authorization failures return `403` with the standard error envelope (see `05-api-architecture.md`).
- Sensitive admin actions (suspend, refund, wallet adjustment, settlement, permission change) additionally require: confirmation modal (frontend) + `reason` field (API) + `AuditLog` entry.
