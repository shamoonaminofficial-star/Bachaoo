import { comparePassword, hashPassword, validatePasswordPolicy } from './password';

describe('password policy', () => {
  it('accepts a compliant password', () => {
    expect(validatePasswordPolicy('Bachatly123').valid).toBe(true);
  });

  it('rejects short passwords', () => {
    const result = validatePasswordPolicy('Ab1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/at least 8/);
  });

  it('rejects passwords without a letter', () => {
    expect(validatePasswordPolicy('12345678').valid).toBe(false);
  });

  it('rejects passwords without a number', () => {
    expect(validatePasswordPolicy('PasswordOnly').valid).toBe(false);
  });

  it('rejects empty input', () => {
    expect(validatePasswordPolicy('').valid).toBe(false);
  });
});

describe('password hashing (bcrypt, 12 rounds)', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Bachatly123');
    expect(hash).not.toContain('Bachatly123');
    expect(await comparePassword('Bachatly123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Bachatly123');
    expect(await comparePassword('WrongPass1', hash)).toBe(false);
  });

  it('produces a bcrypt hash (12-round cost factor)', async () => {
    const hash = await hashPassword('Bachatly123');
    // $2b$12$... — the "12" is the cost factor.
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('salts hashes so identical passwords differ', async () => {
    const a = await hashPassword('Bachatly123');
    const b = await hashPassword('Bachatly123');
    expect(a).not.toBe(b);
  });
});
