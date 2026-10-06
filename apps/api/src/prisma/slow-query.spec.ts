import { SLOW_QUERY_THRESHOLD_MS, isSlowQuery } from './slow-query';

describe('Prisma slow-query guard (Phase 13)', () => {
  it('flags queries slower than the 500ms threshold', () => {
    expect(SLOW_QUERY_THRESHOLD_MS).toBe(500);
    expect(isSlowQuery(499)).toBe(false);
    expect(isSlowQuery(500)).toBe(false);
    expect(isSlowQuery(501)).toBe(true);
    expect(isSlowQuery(3200)).toBe(true);
  });
});
