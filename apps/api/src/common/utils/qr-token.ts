import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * QR redemption tokens.
 *
 * The QR shown to the cashier NEVER contains raw user/deal ids as the
 * credential. The signed, short-lived JWT below IS the credential, and it
 * carries only:
 *   - jti      unique token id (uuid v4) — the replay-protection key
 *   - dealId   deal being redeemed (opaque reference)
 *   - branchId optional branch the token was minted for (opaque reference)
 *
 * It deliberately carries NO userId and NO membershipId. The server-side
 * issuance record in Redis (`qr:jti:<jti>` ->
 * `{ userId, dealId, branchId, issuedAt }`) is the source of truth for who the
 * token belongs to. This way a leaked/screenshot QR reveals nothing about the
 * customer, and any tampering with the JWT payload invalidates the signature.
 *
 * Backend validates: signature, expiry, issuance-record presence, and
 * replay-protects the jti in Redis via SET NX `qr:used:<jti>`
 * (see RedisService.markQrJtiUsed / redemptions.service).
 */
export interface RedemptionTokenPayload {
  /** Unique token id (uuid v4) — the replay-protection key. */
  jti: string;
  /** Deal being redeemed (opaque reference). */
  dealId: string;
  /** Branch the token was minted for, when the customer picked one. */
  branchId?: string;
}

/** Server-side issuance record stored at `qr:jti:<jti>` with the token TTL. */
export interface QrIssuanceRecord {
  userId: string;
  dealId: string;
  branchId: string | null;
  issuedAt: string; // ISO
}

export class QrTokenExpiredError extends Error {
  constructor() {
    super('QR token has expired');
    this.name = 'QrTokenExpiredError';
  }
}

export class QrTokenInvalidError extends Error {
  constructor(reason = 'QR token is invalid') {
    super(reason);
    this.name = 'QrTokenInvalidError';
  }
}

export function signRedemptionToken(
  input: { dealId: string; branchId?: string },
  secret: string,
  ttlSeconds: number,
): { token: string; jti: string; expiresAt: Date } {
  if (!secret) throw new Error('JWT secret is required to sign redemption tokens');
  if (!input.dealId) throw new Error('dealId is required to sign a redemption token');
  const jti = uuidv4();
  const claims: Record<string, string> = { jti, dealId: input.dealId };
  if (input.branchId) claims.branchId = input.branchId;
  const token = jwt.sign(claims, secret, { expiresIn: ttlSeconds });
  return { token, jti, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
}

export function verifyRedemptionToken(token: string, secret: string): RedemptionTokenPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) throw new QrTokenExpiredError();
    if (err instanceof jwt.JsonWebTokenError) throw new QrTokenInvalidError(err.message);
    throw err;
  }

  const payload = decoded as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object') {
    throw new QrTokenInvalidError('QR token payload malformed');
  }
  const { jti, dealId, branchId } = payload;
  if (typeof jti !== 'string' || !jti || typeof dealId !== 'string' || !dealId) {
    throw new QrTokenInvalidError('QR token missing required claims (jti/dealId)');
  }
  if (branchId !== undefined && (typeof branchId !== 'string' || !branchId)) {
    throw new QrTokenInvalidError('QR token branchId claim malformed');
  }
  // Reject tokens that still carry legacy claims (sub/membershipId): they were
  // minted by an older build and must not be honoured.
  if (typeof payload.sub === 'string' || typeof payload.membershipId === 'string') {
    throw new QrTokenInvalidError('QR token uses a retired claim set');
  }
  return {
    jti,
    dealId,
    ...(typeof branchId === 'string' ? { branchId } : {}),
  };
}
