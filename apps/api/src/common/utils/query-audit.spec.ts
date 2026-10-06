import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePagination } from './pagination';

const SRC = join(__dirname, '..', '..');

/**
 * Phase 13 — static regression guards for the unbounded-query audit.
 * These pin the three fixes; they read source text (no DB needed).
 */
describe('unbounded query audit (Phase 13)', () => {
  it('businesses dealsCount sort no longer fetches all businesses into memory', () => {
    const src = readFileSync(join(SRC, 'modules/businesses/businesses.service.ts'), 'utf8');
    // The old unbounded call is gone…
    expect(src).not.toContain('const all = await this.prisma.business.findMany');
    // …replaced by a paged approach driven by the aggregated counts.
    expect(src).toContain('notIn: countedIds');
    expect(src).toContain('slice(skip, skip + take)');
  });

  it('analytics rejects unbounded date ranges', () => {
    const src = readFileSync(join(SRC, 'modules/analytics/analytics.service.ts'), 'utf8');
    expect(src).toContain('RANGE_TOO_LARGE');
    expect(src).toContain('MAX_RANGE_DAYS');
  });

  it('reports reject unbounded date ranges', () => {
    const src = readFileSync(join(SRC, 'modules/reports/reports.service.ts'), 'utf8');
    expect(src).toContain('RANGE_TOO_LARGE');
    expect(src).toContain('MAX_RANGE_DAYS');
  });
});

describe('pagination defaults (Phase 13)', () => {
  it('caps pageSize at 100', () => {
    expect(parsePagination({ pageSize: 1000 }).pageSize).toBe(100);
    expect(parsePagination({ pageSize: '99999' }).take).toBe(100);
  });

  it('defaults to page 1 / size 20 and floors at 1', () => {
    const p = parsePagination({});
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(20);
    expect(parsePagination({ page: -5, pageSize: 0 }).page).toBe(1);
    expect(parsePagination({ page: -5, pageSize: 0 }).pageSize).toBe(20);
  });
});
