import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as public — skips the global JwtAuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
