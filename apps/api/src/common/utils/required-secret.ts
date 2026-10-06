/**
 * Fail-fast secret resolution.
 *
 * In production a missing secret must crash the boot loudly — never silently
 * fall back to a well-known dev value (that would let every deployment share
 * the same signing key). In non-production the dev fallback keeps local
 * workflows (`pnpm dev`, tests, seed) working without env plumbing.
 */
export function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[security] ${name} is not set. Refusing to boot in production with a dev fallback secret.`,
    );
  }
  return devFallback;
}
