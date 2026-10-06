import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@bachatly/database';
import { isSlowQuery } from './slow-query';

/**
 * Shared Prisma client. @bachatly/database re-exports everything from
 * '@prisma/client', so model delegates (user, deal, ...) are available here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    });

    // Phase 13 — slow-query guard: never throws, never blocks; just logs.
    const isProd = process.env.NODE_ENV === 'production';
    this.$use(async (params, next) => {
      const start = Date.now();
      try {
        return await next(params);
      } finally {
        const ms = Date.now() - start;
        if (!isProd && isSlowQuery(ms)) {
          // eslint-disable-next-line no-console
          console.warn(`[prisma:slow-query] ${params.model}.${params.action} took ${ms}ms`);
        }
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
