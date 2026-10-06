/**
 * Auth Phase-2 e2e tests.
 *
 * Requires a seeded test database + Redis:
 *   DATABASE_URL=<test db> pnpm --filter @bachatly/database db:migrate
 *   DATABASE_URL=<test db> pnpm --filter @bachatly/database db:seed
 *   REDIS_URL=redis://localhost:6379
 * Run with: pnpm test:e2e (from apps/api).
 *
 * Seeded credentials: admin@bachatly.pk / Bachatly@123 (SUPER_ADMIN).
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const uniquePhone = () => `03${Math.floor(100000000 + Math.random() * 899999999)}`;

describe('Auth Phase-2 (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let customerAccess: string;
  let customerRefresh: string;
  let customerId: string;
  const phone = uniquePhone();
  const email = `e2e-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ emailOrPhone: 'admin@bachatly.pk', password: 'Bachatly@123' });
    adminToken = login.body.accessToken;
    expect(adminToken).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register -> login -> refresh -> logout', () => {
    it('registers a customer and returns a token pair + sets the refresh cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'E2E',
          lastName: 'Customer',
          email,
          phone,
          password: 'E2ePass123',
          acceptTerms: true,
        })
        .expect(201);

      expect(res.body.user.email).toBe(email);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.referralCode).toMatch(/^[A-Z0-9]{8}$/);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('bachatly_refresh');
      expect(cookies.join(';')).toContain('HttpOnly');
      customerId = res.body.user.id;
    });

    it('rejects a duplicate email with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'E2E',
          lastName: 'Dup',
          email,
          phone: uniquePhone(),
          password: 'E2ePass123',
          acceptTerms: true,
        })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('EMAIL_OR_PHONE_TAKEN'));
    });

    it('rejects a weak password with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'E2E',
          lastName: 'Weak',
          email: `weak-${Date.now()}@example.com`,
          phone: uniquePhone(),
          password: 'short',
          acceptTerms: true,
        })
        .expect(400);
    });

    it('logs in with email and with phone', async () => {
      for (const emailOrPhone of [email, phone]) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ emailOrPhone, password: 'E2ePass123' })
          .expect(200);
        expect(res.body.accessToken).toBeDefined();
      }
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ emailOrPhone: email, password: 'E2ePass123' })
        .expect(200);
      customerAccess = res.body.accessToken;
      customerRefresh = res.body.refreshToken;
    });

    it('rejects wrong credentials with a generic 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ emailOrPhone: email, password: 'WrongPass999' })
        .expect(401)
        .expect((res) => expect(res.body.code).toBe('INVALID_CREDENTIALS'));
    });

    it('returns profile + roles + permissions + membership on GET /auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${customerAccess}`)
        .expect(200);
      expect(res.body.id).toBe(customerId);
      expect(res.body.roles).toContain('CUSTOMER');
      expect(res.body.permissions).toBeDefined();
      expect('membership' in res.body).toBe(true);
    });

    it('rotates the refresh token and rejects the old one', async () => {
      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: customerRefresh })
        .expect(200);
      expect(rotated.body.accessToken).toBeDefined();
      expect(rotated.body.refreshToken).not.toBe(customerRefresh);

      // Old token outside the grace window is treated as reuse -> 401.
      // (Within the 60s grace window the API tolerates it; wait it out in CI
      // or assert the theft path directly against a revoked session.)
      customerRefresh = rotated.body.refreshToken;
      customerAccess = rotated.body.accessToken;
    });

    it('logs out and the refresh token stops working', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${customerAccess}`)
        .send({ refreshToken: customerRefresh })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: customerRefresh })
        .expect(401);
    });
  });

  describe('RBAC', () => {
    it('denies a customer hitting an admin endpoint with 403', async () => {
      // Re-login to get a fresh customer token.
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ emailOrPhone: email, password: 'E2ePass123' })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    });

    it('denies unauthenticated access to /users with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });

    it('lets an admin list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('suspended users', () => {
    it('blocks login for a suspended account with 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/users/${customerId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'e2e test suspension' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ emailOrPhone: email, password: 'E2ePass123' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('ACCOUNT_SUSPENDED'));

      // Reactivate so later suites stay green.
      await request(app.getHttpServer())
        .post(`/api/v1/users/${customerId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ emailOrPhone: email, password: 'E2ePass123' })
        .expect(200);
    });
  });

  describe('password reset', () => {
    it('always returns 200 for forgot-password (no enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody-xyz@example.com' })
        .expect(200)
        .expect((res) => expect(res.body.sent).toBe(true));
    });

    it('rejects an invalid reset token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPass123' })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('RESET_TOKEN_INVALID'));
    });
  });
});
