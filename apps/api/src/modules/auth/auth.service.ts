import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { ReferralStatus } from '@bachatly/database';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ROLES } from '../../common/constants';
import { requiredSecret } from '../../common/utils/required-secret';
import { comparePassword, hashPassword, validatePasswordPolicy } from '../../common/utils/password';
import { DispatchService } from './channels/dispatch.service';
import { OtpChannel } from './channels/notification-channel.interface';
import { LoginDto } from './dto/login.dto';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_MAX_PER_HOUR = 3;
const PASSWORD_RESET_TTL_SECONDS = 1800; // 30 minutes
const EMAIL_VERIFY_TTL_SECONDS = 24 * 3600; // 24 hours
/** Concurrent-refresh tolerance: a rotated token reused inside this window
 *  issues a fresh pair instead of triggering theft protection. */
const ROTATION_GRACE_SECONDS = 60;
/** Brute-force: 5 failed logins per 15 minutes per IP+identifier. */
const LOGIN_FAIL_LIMIT = 5;
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;

const PAKISTAN_PHONE_RE = /^(\+92|0)3\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function randomCode(length = 8): string {
  // Uppercase alphanumeric without ambiguous chars (0/O, 1/I/L).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface OtpRequestResult {
  sent: boolean;
  channel: OtpChannel;
  expiresIn: number;
  /** Echoed outside production only (dev convenience). */
  devCode?: string;
}

export type OtpVerifyResult =
  | { verified: true }
  | { verified: true; user: Record<string, unknown>; accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly dispatch: DispatchService,
  ) {}

  // ------------------------------------------------------------------ helpers

  private get accessSecret(): string {
    return requiredSecret('JWT_SECRET', 'dev-secret-change-me');
  }

  private get refreshSecret(): string {
    return requiredSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me');
  }

  /** Issue an access+refresh pair and persist the refresh session (hashed). */
  private async issueTokenPair(userId: string, email: string | null, meta: RequestMeta) {
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      { secret: this.accessSecret, expiresIn: ACCESS_TOKEN_TTL },
    );
    // The refresh token is a JWT signed with the refresh secret; only its
    // SHA-256 hash is persisted (rotation on every use).
    const refreshToken = this.jwt.sign(
      { sub: userId, type: 'refresh' },
      { secret: this.refreshSecret, expiresIn: `${REFRESH_TOKEN_TTL_SECONDS}s` },
    );

    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256Hex(refreshToken),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private async generateUniqueCode(
    check: (code: string) => Promise<boolean>,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      if (!(await check(code))) return code;
    }
    throw new InternalServerErrorException({
      code: 'CODE_GENERATION_FAILED',
      message: 'Could not generate a unique code, please retry.',
    });
  }

  private async generateUniqueReferralCode(): Promise<string> {
    return this.generateUniqueCode(async (code) => {
      const existing = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      return Boolean(existing);
    });
  }

  private toPublicUser(user: Record<string, unknown>) {
    const { passwordHash: _ph, ...rest } = user;
    return rest;
  }

  private async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async auditAuthEvent(
    userId: string | null,
    action: string,
    entityId: string,
    meta: RequestMeta,
    newValues?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action,
          entity: 'User',
          entityId,
          newValues: (newValues ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    } catch (err) {
      // Auditing must never break auth flows.
      this.logger.warn(`audit write failed (${action}): ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------- register

  async register(dto: RegisterDto, meta: RequestMeta) {
    const policy = validatePasswordPolicy(dto.password);
    if (!policy.valid) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: policy.errors.join('. '),
      });
    }

    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: 'EMAIL_OR_PHONE_TAKEN',
        message: 'This email or phone number is already registered.',
      });
    }

    const role = await this.prisma.role.findUnique({ where: { name: ROLES.CUSTOMER } });
    if (!role) {
      throw new InternalServerErrorException({
        code: 'ROLE_NOT_SEEDED',
        message: 'Customer role is not configured. Contact support.',
      });
    }

    // Resolve an optional referrer — never fail registration over a bad code.
    let referrer: { id: string; referralCode: string } | null = null;
    if (dto.referralCode) {
      referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode },
        select: { id: true, referralCode: true },
      });
    }

    const passwordHash = await hashPassword(dto.password);
    const referralCode = await this.generateUniqueReferralCode();

    // Everything that must succeed-or-fail together lives in one transaction.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          cityId: dto.cityId ?? null,
          referralCode,
          referredById: referrer?.id ?? null,
          status: 'ACTIVE',
          profile: { create: {} },
          wallet: { create: { balance: 0 } },
          rewardAccount: {
            create: { availablePoints: 0, lifetimePoints: 0, redeemedPoints: 0 },
          },
          roles: { create: { roleId: role.id } },
        },
        include: { profile: true },
      });

      if (referrer) {
        const code = await this.generateUniqueCode(async (c) => {
          const existing = await tx.referral.findUnique({
            where: { code: c },
            select: { id: true },
          });
          return Boolean(existing);
        });
        await tx.referral.create({
          data: {
            referrerId: referrer.id,
            referredUserId: created.id,
            code,
            // INVITED: the reward is granted later when the qualifying event
            // (e.g. first membership purchase) fires.
            status: ReferralStatus.INVITED,
          },
        });
      }
      return created;
    });

    const tokens = await this.issueTokenPair(user.id, user.email, meta);

    // Fire-and-forget: email verification link (single-use, 24h TTL).
    void this.sendEmailVerification(user.id, user.email as string).catch((err) =>
      this.logger.warn(`verification email failed: ${(err as Error).message}`),
    );

    return { user: this.toPublicUser(user), ...tokens };
  }

  // ---------------------------------------------------------------------- login

  async login(dto: LoginDto, meta: RequestMeta) {
    const identifier = dto.emailOrPhone.trim().toLowerCase();
    const throttleKey = `login:fail:${meta.ip ?? 'unknown'}:${sha256Hex(identifier).slice(0, 32)}`;

    const failures = parseInt((await this.redis.get(throttleKey)) || '0', 10);
    if (failures >= LOGIN_FAIL_LIMIT) {
      throw new ForbiddenException({
        code: 'LOGIN_RATE_LIMITED',
        message: 'Too many failed attempts. Please try again in 15 minutes.',
      });
    }

    const recordFailure = () =>
      this.redis.incrWithExpire(throttleKey, LOGIN_FAIL_WINDOW_SECONDS);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: dto.emailOrPhone.trim() }],
      },
    });

    // passwordHash is null for social-login accounts — they cannot use password login.
    if (!user || !user.passwordHash || !(await comparePassword(dto.password, user.passwordHash))) {
      await recordFailure();
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email/phone or password.',
      });
    }
    if (user.status !== 'ACTIVE') {
      await recordFailure();
      throw new ForbiddenException({
        code: user.status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_INACTIVE',
        message: 'This account is not active. Contact support.',
      });
    }

    await this.redis.del(throttleKey);
    const tokens = await this.issueTokenPair(user.id, user.email, meta);
    return { user: this.toPublicUser(user), ...tokens };
  }

  // -------------------------------------------------------------------- refresh

  async refresh(refreshToken: string, meta: RequestMeta) {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired. Please sign in again.',
      });
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired. Please sign in again.',
      });
    }

    const hash = sha256Hex(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });

    // Happy path: live session, active user -> rotate.
    if (
      session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.userId === payload.sub &&
      session.user.status === 'ACTIVE'
    ) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), rotatedAt: new Date() },
      });
      const tokens = await this.issueTokenPair(session.userId, session.user.email, meta);
      return tokens;
    }

    // Reuse of a recently-rotated token (e.g. double tab / retry race):
    // tolerate inside the grace window by rotating the newest live session.
    if (session?.revokedAt && session.rotatedAt) {
      const ageSec = (Date.now() - session.rotatedAt.getTime()) / 1000;
      if (ageSec <= ROTATION_GRACE_SECONDS) {
        const latest = await this.prisma.session.findFirst({
          where: { userId: session.userId, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });
        if (latest && latest.user.status === 'ACTIVE') {
          await this.prisma.session.update({
            where: { id: latest.id },
            data: { revokedAt: new Date(), rotatedAt: new Date() },
          });
          return this.issueTokenPair(latest.userId, latest.user.email, meta);
        }
      }
    }

    // Otherwise this is token theft (valid JWT, no live session): nuke every
    // session for the user so the stolen token — and any siblings — die.
    await this.revokeAllSessions(payload.sub);
    await this.auditAuthEvent(payload.sub, 'auth.refresh_token_reuse', payload.sub, meta, {
      reason: 'refresh token presented with no live session — all sessions revoked',
    });
    throw new UnauthorizedException({
      code: 'REFRESH_TOKEN_REUSED',
      message: 'Session compromised. All sessions revoked — please sign in again.',
    });
  }

  // --------------------------------------------------------------------- logout

  async logout(userId: string, refreshToken: string | undefined) {
    if (refreshToken) {
      const session = await this.prisma.session.findFirst({
        where: { refreshTokenHash: sha256Hex(refreshToken), userId },
      });
      if (session && !session.revokedAt) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
      }
    }
    return { loggedOut: true };
  }

  /** Revokes every session for the user (all devices). */
  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId);
    return { loggedOut: true };
  }

  // ------------------------------------------------------------------------- me

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        city: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        memberships: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'User not found.' });
    }
    const { memberships, roles, ...rest } = this.toPublicUser(user as Record<string, unknown>) as {
      memberships?: unknown[];
      roles?: Array<{ role: { name: string; permissions: Array<{ permission: { key: string } }> } }>;
    } & Record<string, unknown>;

    const roleNames = (roles ?? []).map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        (roles ?? []).flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
      ),
    ];

    return {
      ...rest,
      roles: roleNames,
      permissions,
      membership: (memberships as unknown[])?.[0] ?? null,
    };
  }

  // ------------------------------------------------------------------------ OTP

  private validateOtpIdentifier(identifier: string, channel: OtpChannel): void {
    const ok =
      channel === 'email' ? EMAIL_RE.test(identifier) : PAKISTAN_PHONE_RE.test(identifier);
    if (!ok) {
      throw new BadRequestException({
        code: 'INVALID_IDENTIFIER',
        message:
          channel === 'email'
            ? 'identifier must be a valid email address for the email channel'
            : 'identifier must be a valid Pakistani mobile number (03XXXXXXXXX) for sms/whatsapp',
      });
    }
  }

  async requestOtp(dto: OtpRequestDto): Promise<OtpRequestResult> {
    this.validateOtpIdentifier(dto.identifier, dto.channel);

    // 3 requests per hour per identifier, on top of the per-route @Throttle.
    const throttleKey = `otp:throttle:${dto.channel}:${sha256Hex(dto.identifier).slice(0, 32)}`;
    const count = await this.redis.incrWithExpire(throttleKey, 3600);
    if (count > OTP_MAX_PER_HOUR) {
      throw new ForbiddenException({
        code: 'OTP_RATE_LIMITED',
        message: 'Too many OTP requests. Please try again later.',
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const key = `otp:${dto.channel}:${sha256Hex(dto.identifier).slice(0, 32)}`;
    await this.redis.set(key, sha256Hex(code), OTP_TTL_SECONDS);

    const result = await this.dispatch.sendOtp(dto.identifier, dto.channel, code);
    if (!result.ok) {
      this.logger.error(`OTP dispatch failed (${dto.channel}): ${result.reason}`);
    }

    return {
      sent: result.ok,
      channel: dto.channel,
      expiresIn: OTP_TTL_SECONDS,
      // Dev convenience only: echo the code outside production.
      ...(process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    };
  }

  async verifyOtp(dto: OtpVerifyDto, meta: RequestMeta): Promise<OtpVerifyResult> {
    // The identifier's channel is embedded in the key namespace; try each.
    let stored: string | null = null;
    let matchedChannel: OtpChannel | null = null;
    for (const channel of ['email', 'sms', 'whatsapp'] as OtpChannel[]) {
      const key = `otp:${channel}:${sha256Hex(dto.identifier).slice(0, 32)}`;
      const value = await this.redis.get(key);
      if (value) {
        stored = value;
        matchedChannel = channel;
        break;
      }
    }
    if (!stored || !matchedChannel) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'The code has expired. Please request a new one.',
      });
    }
    if (!timingSafeEqualHex(stored, sha256Hex(dto.code))) {
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: 'The code is incorrect. Please try again.',
      });
    }
    await this.redis.del(`otp:${matchedChannel}:${sha256Hex(dto.identifier).slice(0, 32)}`);

    // Mark the matching contact point verified; issue a session if the user exists.
    const isEmail = matchedChannel === 'email';
    const user = await this.prisma.user.findFirst({
      where: isEmail ? { email: dto.identifier } : { phone: dto.identifier },
    });
    if (!user) {
      return { verified: true };
    }
    const data = isEmail ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() };
    await this.prisma.user.update({ where: { id: user.id }, data });
    if (user.status !== 'ACTIVE') {
      return { verified: true };
    }
    const tokens = await this.issueTokenPair(user.id, user.email, meta);
    return { verified: true, user: this.toPublicUser(user), ...tokens };
  }

  // --------------------------------------------------------------- email verify

  /** Issues a 24h single-use email-verification token and sends the link. */
  async sendEmailVerification(userId: string, email: string): Promise<void> {
    const token = this.jwt.sign(
      { sub: userId, type: 'email_verify' },
      { secret: this.accessSecret, expiresIn: `${EMAIL_VERIFY_TTL_SECONDS}s` },
    );
    await this.redis.set(`emailverify:${sha256Hex(token)}`, userId, EMAIL_VERIFY_TTL_SECONDS);
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const link = `${base}/verify-email?token=${token}`;
    await this.dispatch.sendEmailVerification(email, link);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const key = `emailverify:${sha256Hex(dto.token)}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new BadRequestException({
        code: 'EMAIL_TOKEN_INVALID',
        message: 'Verification link is invalid or expired.',
      });
    }
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwt.verify(dto.token, { secret: this.accessSecret });
    } catch {
      await this.redis.del(key);
      throw new BadRequestException({
        code: 'EMAIL_TOKEN_INVALID',
        message: 'Verification link is invalid or expired.',
      });
    }
    if (payload.type !== 'email_verify' || payload.sub !== userId) {
      throw new BadRequestException({
        code: 'EMAIL_TOKEN_INVALID',
        message: 'Verification link is invalid or expired.',
      });
    }
    await this.redis.del(key); // single-use
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    return { verified: true };
  }

  // ------------------------------------------------------------ password reset

  async forgotPassword(dto: ForgotPasswordDto) {
    // Always 200 — never reveal whether the email is registered.
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, email: true },
    });
    if (user?.email) {
      const token = crypto.randomBytes(32).toString('hex');
      await this.redis.set(
        `pwdreset:${sha256Hex(token)}`,
        user.id,
        PASSWORD_RESET_TTL_SECONDS,
      );
      const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const link = `${base}/reset-password?token=${token}`;
      void this.dispatch.sendPasswordReset(user.email, link).catch((err) =>
        this.logger.warn(`password reset email failed: ${(err as Error).message}`),
      );
    }
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta) {
    const policy = validatePasswordPolicy(dto.newPassword);
    if (!policy.valid) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: policy.errors.join('. '),
      });
    }
    const key = `pwdreset:${sha256Hex(dto.token)}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new BadRequestException({
        code: 'RESET_TOKEN_INVALID',
        message: 'Reset link is invalid or expired. Please request a new one.',
      });
    }
    await this.redis.del(key); // single-use

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });
    // Security: a password change kills every existing session.
    await this.revokeAllSessions(userId);
    await this.auditAuthEvent(userId, 'auth.password_reset', userId, meta);
    return { reset: true };
  }

  // ------------------------------------------------------------ Phase 7: self-service security

  /**
   * Change the signed-in user's password. Requires the current password,
   * enforces the password policy, rejects a password identical to the
   * current one, and revokes every existing session (all devices).
   */
  async changePassword(userId: string, dto: ChangePasswordDto, meta: RequestMeta) {
    const policy = validatePasswordPolicy(dto.newPassword);
    if (!policy.valid) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: policy.errors.join('. '),
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }
    const matches = await comparePassword(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'New password must be different from the current password.',
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });
    // Security: a password change kills every existing session.
    await this.revokeAllSessions(userId);
    await this.auditAuthEvent(userId, 'auth.password_change', userId, meta);
    return { changed: true, sessionsRevoked: true };
  }

  /**
   * Active sessions for the current user (newest first).
   * Note: access tokens are stateless JWTs — there is no server-side row for
   * the *current* access token, so the "current session" is the refresh
   * session whose lifetime the access token was minted under; we cannot mark
   * it reliably and leave that to the client.
   */
  async listSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        rotatedAt: true,
      },
    });
    return sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      lastSeen: s.rotatedAt ?? s.createdAt,
    }));
  }
}
