import * as bcrypt from 'bcryptjs';

/**
 * Password policy (single source of truth — mirrors packages/validation passwordSchema):
 * minimum 8 characters, at least one letter and one number.
 */
const MIN_LENGTH = 8;
const LETTER_RE = /[A-Za-z]/;
const DIGIT_RE = /\d/;

/** bcrypt cost factor: 12 rounds (OWASP recommendation for server-side hashing). */
const BCRYPT_ROUNDS = 12;

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a password against the platform policy without hashing.
 * Used by DTOs/services before any persistence happens.
 */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (!password || password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (!LETTER_RE.test(password ?? '')) {
    errors.push('Password must contain at least one letter');
  }
  if (!DIGIT_RE.test(password ?? '')) {
    errors.push('Password must contain at least one number');
  }
  return { valid: errors.length === 0, errors };
}

/** Hashes a password with bcrypt (12 rounds). Never store or log raw passwords. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Timing-safe comparison of a raw password against a stored bcrypt hash. */
export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
