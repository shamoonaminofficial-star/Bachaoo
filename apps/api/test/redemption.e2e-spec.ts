/**
 * Redemption e2e tests.
 *
 * TODO: requires a test database (DATABASE_URL_TEST) + Redis running.
 * Run with: pnpm test:e2e (from apps/api).
 *
 * NOTE: AppModule imports the 18 stub modules owned by another worker
 * (src/modules/<name>/<name>.module.ts). These specs will not compile until
 * those stubs land.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Redemptions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('qr -> confirm -> double-confirm rejected', () => {
    // TODO: seed a customer with active membership, a published deal, and a
    // staff user; then:
    // 1. POST /api/v1/redemptions/qr (customer token) -> 201 { token, jti, expiresIn }
    // 2. GET /api/v1/redemptions/deal/:id/eligibility -> { eligible: true }
    // 3. POST /api/v1/redemptions/confirm (staff token, { token, billAmount })
    //    -> 201 receipt with server-computed discount/cashback/points
    // 4. POST /api/v1/redemptions/confirm with the SAME token -> 409 QR_ALREADY_USED
    // 5. GET /api/v1/redemptions/history (customer) -> paginated, contains the redemption
    it.todo('issues a QR token and confirms it exactly once');
    it.todo('rejects expired QR tokens with 410');
  });

  describe('eligibility gate', () => {
    // TODO: deal requiring membership redeemed by non-member -> 403 MEMBERSHIP_REQUIRED
    //       per-user limit exceeded -> 422 PER_USER_LIMIT_REACHED
    it.todo('returns machine-readable reasons for ineligible deals');
  });
});
