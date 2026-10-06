import { AdminModerationService } from './admin-moderation.service';

/**
 * Phase 9 — admin moderation service tests (batch per-item results + fraud alerts).
 * Prisma/Redis/BusinessesService/DealsService are mocked; no DB touched.
 */

function mockPrisma() {
  return {
    deal: {
      findFirst: jest.fn().mockResolvedValue({ id: 'd1', status: 'PUBLISHED' }),
      update: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, status: 'PAUSED' })),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) =>
      fn({
        supportTicket: { update: jest.fn().mockResolvedValue({ id: 't1' }) },
        supportMessage: { create: jest.fn().mockResolvedValue({}) },
      }),
    ),
  };
}

function mockRedis() {
  const store = new Map<string, string[]>();
  return {
    async lrange(key: string, start: number, stop: number) {
      const list = store.get(key) ?? [];
      return list.slice(start, stop + 1);
    },
    async llen(key: string) {
      return (store.get(key) ?? []).length;
    },
    async lpush(key: string, value: string) {
      const list = store.get(key) ?? [];
      list.unshift(value);
      store.set(key, list);
      return list.length;
    },
    async del(key: string) {
      const n = (store.get(key) ?? []).length;
      store.delete(key);
      return n;
    },
  };
}

function makeService() {
  const prisma = mockPrisma();
  const redis = mockRedis();
  const businesses = {
    verify: jest.fn().mockResolvedValue({}),
    reactivate: jest.fn().mockResolvedValue({}),
    suspend: jest.fn().mockImplementation((id: string, dto: any) =>
      dto?.reason
        ? Promise.resolve({})
        : Promise.reject({ response: { code: 'REASON_REQUIRED', message: 'reason' } }),
    ),
  };
  const deals = {
    approve: jest.fn().mockImplementation((_adminId: string, id: string) =>
      id === 'bad'
        ? Promise.reject({ response: { code: 'DEAL_NOT_FOUND', message: 'missing' } })
        : Promise.resolve({}),
    ),
    reject: jest.fn().mockResolvedValue({}),
    publish: jest.fn().mockResolvedValue({}),
  };
  const overview = { invalidateOverview: jest.fn().mockResolvedValue(undefined) };
  const svc = new AdminModerationService(prisma as any, redis as any, businesses as any, deals as any, overview as any, { recomputeBusinessRating: jest.fn(async () => null) } as any);
  return { svc, prisma, redis, businesses, deals };
}

describe('AdminModerationService.batchBusinesses', () => {
  it('returns per-item results; one bad id does not kill the batch', async () => {
    const { svc, businesses } = makeService();
    businesses.verify.mockImplementation((id: string) =>
      id === 'bad'
        ? Promise.reject({ response: { code: 'NOT_FOUND', message: 'missing' } })
        : Promise.resolve({}),
    );
    const { results } = await svc.batchBusinesses('admin1', { ids: ['ok1', 'bad'], action: 'verify' });
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 'ok1', ok: true });
    expect(results[1].ok).toBe(false);
    expect(results[1].error?.code).toBe('NOT_FOUND');
  });

  it('requires a reason for suspend', async () => {
    const { svc } = makeService();
    await expect(svc.batchBusinesses('admin1', { ids: ['b1'], action: 'suspend' })).rejects.toMatchObject({
      response: { code: 'REASON_REQUIRED' },
    });
  });

  it('rejects batches larger than 50', async () => {
    const { svc } = makeService();
    await expect(
      svc.batchBusinesses('admin1', { ids: Array.from({ length: 51 }, (_, i) => `b${i}`), action: 'verify' }),
    ).rejects.toMatchObject({ response: { code: 'BATCH_TOO_LARGE' } });
  });
});

describe('AdminModerationService.batchDeals', () => {
  it('approves good ids and reports failures per item', async () => {
    const { svc } = makeService();
    const { results } = await svc.batchDeals('admin1', ['ADMIN'], { ids: ['d1', 'bad'], action: 'approve' });
    expect(results).toEqual([
      { id: 'd1', ok: true },
      { id: 'bad', ok: false, error: { code: 'DEAL_NOT_FOUND', message: 'missing' } },
    ]);
  });

  it('requires a reason for reject', async () => {
    const { svc } = makeService();
    await expect(svc.batchDeals('admin1', ['ADMIN'], { ids: ['d1'], action: 'reject' })).rejects.toMatchObject({
      response: { code: 'REASON_REQUIRED' },
    });
  });

  it('admin-pauses published deals directly', async () => {
    const { svc, prisma } = makeService();
    const { results } = await svc.batchDeals('admin1', ['ADMIN'], { ids: ['d1'], action: 'pause' });
    expect(results[0].ok).toBe(true);
    expect(prisma.deal.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { status: 'PAUSED' } });
  });
});

describe('AdminModerationService.fraudAlerts', () => {
  it('surfaces persisted signals and ack clears the feed', async () => {
    const { svc, redis } = makeService();
    await redis.lpush('fraud:alerts', JSON.stringify({ id: 'fr_1', type: 'SUSPICIOUS_QR_RATE', userId: 'u1' }));
    const alerts = await svc.fraudAlerts(50);
    expect(alerts.total).toBe(1);
    expect(alerts.items[0]).toMatchObject({ type: 'SUSPICIOUS_QR_RATE', userId: 'u1' });
    const ack = await svc.ackFraudAlerts();
    expect(ack.acknowledged).toBe(true);
    expect(ack.cleared).toBe(1);
    expect((await svc.fraudAlerts()).items).toHaveLength(0);
  });

  it('tolerates a dead redis (returns an empty feed)', async () => {
    const { svc } = makeService();
    (svc as any).redis = {
      lrange: jest.fn().mockRejectedValue(new Error('down')),
      llen: jest.fn().mockRejectedValue(new Error('down')),
    };
    await expect(svc.fraudAlerts()).resolves.toEqual({ items: [], total: 0 });
  });
});
