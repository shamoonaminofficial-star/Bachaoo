import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires the caller to hold at least one of the given permission keys
 * (e.g. 'deal.approve', 'payment.verify').
 */
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
