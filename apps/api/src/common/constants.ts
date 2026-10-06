/**
 * Canonical role keys for @Roles(). Seed data (Role.name) must use these exact
 * values so the guards match. Display names can live in Role.description.
 */
export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  BUSINESS_MANAGER: 'BUSINESS_MANAGER',
  CASHIER: 'CASHIER',
  SCANNER: 'SCANNER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
  CONTENT_MANAGER: 'CONTENT_MANAGER',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  MARKETING_MANAGER: 'MARKETING_MANAGER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/** Business-side staff roles allowed to confirm QR redemptions at a branch. */
export const REDEMPTION_STAFF_ROLES = [
  ROLES.BUSINESS_OWNER,
  ROLES.BUSINESS_MANAGER,
  ROLES.CASHIER,
  ROLES.SCANNER,
] as const;

/** Platform admin roles. */
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN] as const;

/** Display timezone for the platform. Stored timestamps are UTC. */
export const APP_TIMEZONE = 'Asia/Karachi';
