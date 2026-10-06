import { toCsv, ReportsService } from './reports.service';

/**
 * Phase 12 tests: CSV export shape (RFC-4180 escaping), unknown report types,
 * and the honest XLSX 501.
 */

describe('toCsv', () => {
  it('writes a header plus rows', () => {
    const csv = toCsv(['a', 'b'], [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv(['name', 'note'], [{ name: 'Acme, Inc.', note: 'said "hi"\nbye' }]);
    expect(csv).toBe('name,note\r\n"Acme, Inc.","said ""hi""\nbye"\r\n');
  });

  it('renders null/undefined as empty cells', () => {
    const csv = toCsv(['a', 'b'], [{ a: null, b: undefined }]);
    expect(csv).toBe('a,b\r\n,\r\n');
  });

  it('handles empty rows', () => {
    expect(toCsv(['a'], [])).toBe('a\r\n');
  });
});

describe('ReportsService.reportBuilder', () => {
  const svc = new ReportsService({} as any);

  it('resolves every documented report type', () => {
    for (const type of ['membership-sales', 'redemptions', 'savings', 'commissions', 'settlements', 'businesses', 'users']) {
      expect(() => svc.reportBuilder(type)).not.toThrow();
    }
  });

  it('rejects unknown report types with REPORT_NOT_FOUND', () => {
    expect(() => svc.reportBuilder('nope')).toThrow();
    try {
      svc.reportBuilder('nope');
      fail('should have thrown');
    } catch (err: any) {
      expect(err.response?.code ?? err.code).toBe('REPORT_NOT_FOUND');
    }
  });
});

describe('ReportsService.exportReport', () => {
  it('returns 501 for xlsx with an honest message', async () => {
    const svc = new ReportsService({} as any);
    await expect(svc.exportReport('users', { format: 'xlsx' } as any)).rejects.toMatchObject({
      response: { code: 'XLSX_NOT_SUPPORTED' },
    });
  });

  it('builds a CSV with the report columns as the header', async () => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      membership: { count: jest.fn().mockResolvedValue(0) },
    };
    const svc = new ReportsService(prisma as any);
    const result = await svc.exportReport('users', { format: 'csv' });
    expect(result.filename).toMatch(/^bachatly-users-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.csv.startsWith('day,customers,partners')).toBe(true);
    expect(result.rows).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
