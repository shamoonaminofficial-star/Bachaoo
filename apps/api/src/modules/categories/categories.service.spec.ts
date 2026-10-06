import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function buildService(overrides: { category?: Record<string, jest.Mock> } = {}) {
  const category = {
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
    create: jest.fn(async (args: any) => ({ id: 'new-id', ...args.data })),
    update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
    ...overrides.category,
  };
  const prisma = {
    category,
    subcategory: { findMany: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    business: { count: jest.fn(async () => 0) },
    deal: { count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops.map((op) => op))),
  };
  const storage = { upload: jest.fn(), delete: jest.fn() };
  const service = new CategoriesService(prisma as any, storage as any);
  return { service, prisma, storage };
}

describe('CategoriesService.reorder', () => {
  it('rewrites sortOrder 0..n in id order inside a transaction', async () => {
    const ids = ['c1', 'c2', 'c3'];
    const { service, prisma } = buildService({
      category: {
        findMany: jest.fn(async () => ids.map((id) => ({ id }))),
      } as any,
    });
    // listAdmin is called at the end — stub its internals
    (prisma.category.findMany as jest.Mock).mockResolvedValueOnce(ids.map((id) => ({ id })));

    const result = await service.reorder({ ids });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const ops = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    expect(ops).toHaveLength(3);
    // Each op is a prisma.category.update promise — verify via the update mock calls
    expect(prisma.category.update).toHaveBeenCalledTimes(3);
    expect(prisma.category.update).toHaveBeenNthCalledWith(1, { where: { id: 'c1' }, data: { sortOrder: 0 } });
    expect(prisma.category.update).toHaveBeenNthCalledWith(2, { where: { id: 'c2' }, data: { sortOrder: 1 } });
    expect(prisma.category.update).toHaveBeenNthCalledWith(3, { where: { id: 'c3' }, data: { sortOrder: 2 } });
    expect(Array.isArray(result)).toBe(true);
  });

  it('rejects duplicate ids with 400', async () => {
    const { service } = buildService();
    await expect(service.reorder({ ids: ['c1', 'c1'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown ids with 404', async () => {
    const { service } = buildService({
      category: { findMany: jest.fn(async () => [{ id: 'c1' }]) } as any,
    });
    await expect(service.reorder({ ids: ['c1', 'nope'] })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CategoriesService.remove', () => {
  it('soft-deletes a category with no dependents', async () => {
    const { service, prisma } = buildService({
      category: {
        findFirst: jest.fn(async () => ({ id: 'c1' })),
        update: jest.fn(async () => ({})),
      } as any,
    });
    const result = await service.remove('c1');
    expect(result).toEqual({ deleted: true, id: 'c1' });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
  });

  it('returns 409 with counts when businesses use the category', async () => {
    const { service, prisma } = buildService({
      category: { findFirst: jest.fn(async () => ({ id: 'c1' })) } as any,
    });
    (prisma.business.count as jest.Mock).mockResolvedValue(3);
    await expect(service.remove('c1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CATEGORY_IN_USE' }),
    });
  });
});
