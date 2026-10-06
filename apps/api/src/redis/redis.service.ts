import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin wrapper around ioredis used for:
 * - OTP codes / hashes (short TTL)
 * - OTP request throttling counters
 * - QR redemption token issuance records + replay protection
 *
 * Key namespaces:
 *   otp:<phone>          -> sha256(otp code), 300s TTL
 *   otp:throttle:<phone> -> request counter, 3600s TTL
 *   qr:jti:<jti>         -> JSON { userId, dealId, branchId?, issuedAt }, token TTL
 *   qr:used:<jti>        -> replay guard set NX at confirm time
 *   qr:mint:<userId>      -> QR mint attempts per rolling hour (fraud signal, never blocks)
 *   admin:overview        -> cached admin overview payload, 300s TTL
 *   fraud:alerts          -> capped list of fraud signal events, 7d TTL
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.client.on('error', (err: Error) =>
      this.logger.warn(`Redis error: ${err.message}`),
    );
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSec?: number): Promise<'OK'> {
    if (ttlSec && ttlSec > 0) {
      return this.client.set(key, value, 'EX', ttlSec);
    }
    return this.client.set(key, value);
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Set only if not exists, with TTL. Returns true when the key was set.
   */
  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSec, 'NX');
    return res === 'OK';
  }

  /**
   * Increment a counter and set its TTL on first increment.
   * Returns the new count.
   */
  async incrWithExpire(key: string, ttlSec: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSec);
    }
    return count;
  }

  /** Replay guard: has this QR jti already been consumed? */
  async isQrJtiUsed(jti: string): Promise<boolean> {
    const exists = await this.client.exists(`qr:used:${jti}`);
    return exists === 1;
  }

  /**
   * Atomically mark a QR jti as used (SET NX). Returns true on first use,
   * false when the jti was already consumed -> caller must reject with 409.
   */
  markQrJtiUsed(jti: string, ttlSec: number): Promise<boolean> {
    return this.setNx(`qr:used:${jti}`, '1', ttlSec);
  }

  /** Connectivity probe for health checks. */
  ping(): Promise<string> {
    return this.client.ping();
  }

  /** Push to the head of a list (admin alert feeds, activity buffers). */
  async lpush(key: string, value: string): Promise<number> {
    return this.client.lpush(key, value);
  }

  /** Read a slice of a list (newest first). */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  /** Length of a list. */
  async llen(key: string): Promise<number> {
    return this.client.llen(key);
  }

  /** Trim a list to a maximum length (keeps newest). */
  async ltrim(key: string, maxLen: number): Promise<'OK'> {
    return this.client.ltrim(key, 0, maxLen - 1);
  }

  /** Refresh/extend a key's TTL. */
  async expire(key: string, ttlSec: number): Promise<number> {
    return this.client.expire(key, ttlSec);
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch (err) {
      this.logger.warn(`Redis quit failed: ${(err as Error).message}`);
    }
  }
}
