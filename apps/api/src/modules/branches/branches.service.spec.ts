import { haversineKm, validateOpeningHours } from './branches.service';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(31.5204, 74.3587, 31.5204, 74.3587)).toBe(0);
  });

  it('computes ~111.19 km for one degree of latitude', () => {
    // 1 degree of latitude ≈ 111.19 km everywhere.
    const d = haversineKm(31.0, 74.0, 32.0, 74.0);
    expect(d).toBeCloseTo(111.19, 0);
  });

  it('computes a plausible Lahore–Islamabad distance', () => {
    // Lahore (31.5204, 74.3587) -> Islamabad (33.6844, 73.0479) ≈ 270 km by road;
    // great-circle is shorter, roughly 240–260 km.
    const d = haversineKm(31.5204, 74.3587, 33.6844, 73.0479);
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(300);
  });

  it('is symmetric', () => {
    const a = haversineKm(32.0875, 72.6748, 31.51, 74.35);
    const b = haversineKm(31.51, 74.35, 32.0875, 72.6748);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('validateOpeningHours', () => {
  it('accepts a valid weekly schedule', () => {
    expect(
      validateOpeningHours({ mon: ['09:00', '22:00'], fri: ['13:00', '23:30'] }),
    ).toEqual({ mon: ['09:00', '22:00'], fri: ['13:00', '23:30'] });
  });

  it('returns undefined for missing input', () => {
    expect(validateOpeningHours(undefined)).toBeUndefined();
    expect(validateOpeningHours(null)).toBeUndefined();
  });

  it('rejects invalid day keys', () => {
    expect(() => validateOpeningHours({ funday: ['09:00', '22:00'] })).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'INVALID_HOURS' }) }),
    );
  });

  it('rejects malformed time ranges', () => {
    expect(() => validateOpeningHours({ mon: ['9am', '22:00'] })).toThrow();
    expect(() => validateOpeningHours({ mon: ['09:00'] })).toThrow();
    expect(() => validateOpeningHours({ mon: 'closed' })).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => validateOpeningHours([['09:00', '22:00']])).toThrow();
  });
});
