/**
 * Phase 13 — slow-query guard helpers (pure, no Prisma imports so they are
 * trivially unit-testable).
 */

/** Queries slower than this are logged in non-production environments. */
export const SLOW_QUERY_THRESHOLD_MS = 500;

/** Is this query duration worth flagging for index review? */
export function isSlowQuery(durationMs: number): boolean {
  return durationMs > SLOW_QUERY_THRESHOLD_MS;
}
