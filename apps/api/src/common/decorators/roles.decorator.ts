import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Requires the caller to hold at least one of the given role keys.
 * Role keys are the canonical uppercase values in src/common/constants.ts
 * (e.g. 'CUSTOMER', 'BUSINESS_OWNER').
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
