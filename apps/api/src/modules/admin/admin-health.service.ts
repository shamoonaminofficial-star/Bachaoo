import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Phase 9 — system health snapshot for the admin panel.
 * Probes are cheap and non-blocking; a failing dependency degrades the
 * payload to "down" instead of failing the endpoint.
 */
@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getHealth() {
    const [db, redis, storage] = await Promise.all([
      this.probeDb(),
      this.probeRedis(),
      this.probeStorage(),
    ]);
    return {
      status: db.ok && redis.ok ? 'ok' : 'degraded',
      env: process.env.NODE_ENV ?? 'development',
      uptimeSec: Math.floor(process.uptime()),
      version: process.env.APP_VERSION ?? 'dev',
      db,
      redis,
      storage,
      checkedAt: new Date().toISOString(),
    };
  }

  private async probeDb() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      this.logger.warn(`db health probe failed: ${(err as Error).message}`);
      return { ok: false, latencyMs: Date.now() - started, error: (err as Error).message };
    }
  }

  private async probeRedis() {
    const started = Date.now();
    try {
      const pong = await this.redis.ping();
      return { ok: pong === 'PONG', latencyMs: Date.now() - started };
    } catch (err) {
      this.logger.warn(`redis health probe failed: ${(err as Error).message}`);
      return { ok: false, latencyMs: Date.now() - started, error: (err as Error).message };
    }
  }

  private probeStorage() {
    // Mirrors the StorageModule selection logic (see storage.interface.ts).
    const backend = process.env.S3_ENDPOINT ? 's3' : 'local';
    return { ok: true, backend, uploadDir: backend === 'local' ? (process.env.UPLOAD_DIR ?? 'uploads') : null };
  }
}
