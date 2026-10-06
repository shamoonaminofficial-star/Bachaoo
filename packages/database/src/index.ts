// Bachatly database package entrypoint.
// Re-exports the generated Prisma client types/enums and provides a
// convenience factory for creating a PrismaClient instance.

export * from '@prisma/client';

import { PrismaClient } from '@prisma/client';

/**
 * Create a new PrismaClient bound to the Bachatly schema.
 * Pass through any standard PrismaClient options (datasources, log, ...).
 */
export function createPrismaClient(
  options?: ConstructorParameters<typeof PrismaClient>[0],
): PrismaClient {
  return new PrismaClient(options);
}
