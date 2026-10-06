/**
 * Auth e2e tests.
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
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
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

  it('boots and serves the health check', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect((res: { body: any }) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('bachatly-api');
      });
  });

  describe('register -> login -> refresh rotation', () => {
    // TODO: implement once DATABASE_URL_TEST is wired:
    // 1. POST /api/v1/auth/register -> 201, returns { user, accessToken, refreshToken }
    // 2. POST /api/v1/auth/login with the same credentials -> 200, new token pair
    // 3. POST /api/v1/auth/refresh with refreshToken -> 200, rotated pair
    // 4. POST /api/v1/auth/refresh with the OLD refreshToken -> 401 (rotation enforced)
    // 5. GET /api/v1/auth/me with accessToken -> 200, includes profile + membership
    // 6. POST /api/v1/auth/logout -> 200; refresh afterwards -> 401
    it.todo('registers a customer and returns a token pair');
    it.todo('logs in and rotates refresh tokens (old token rejected)');
  });

  describe('OTP flow', () => {
    // TODO: POST /api/v1/auth/otp/request -> 200 (throttled 5/min, 5/hour per phone)
    //       POST /api/v1/auth/otp/verify with wrong code -> 400 OTP_INVALID
    //       POST /api/v1/auth/otp/verify with correct code -> 200, phoneVerifiedAt set
    it.todo('requests and verifies an OTP code');
  });
});
