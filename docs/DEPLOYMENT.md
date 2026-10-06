# Bachatly Deployment Guide

> Last verified: **2026-10-06** (Phase 14 release engineering). The local setup
> below was actually run on a clean Ubuntu VM **without Docker**; the Docker
> path is kept as an alternative. `pnpm -r build`, both typechecks
> (`apps/api`: 0 errors, `apps/web`: 0 errors), the full API unit suite
> (**255/255 passing**), and a boot + live-endpoint smoke test of the compiled
> API were all green on 2026-10-06.

## 1. Prerequisites

- Node.js 20+ (verified on v24.20.0), pnpm 9+ (`npm install -g pnpm`)
- PostgreSQL 16 and Redis 7 — via Docker **or** system packages
- S3-compatible storage for uploads (local dev can use the filesystem stub)
- Domain + TLS (reverse proxy), SMTP credentials for email

## 2. Local setup — verified sequence (no Docker)

```bash
# 1. Toolchain
npm install -g pnpm
sudo apt-get update && sudo apt-get install -y postgresql redis-server
sudo service postgresql start
sudo redis-server --daemonize yes   # systemd unit may not work in containers

# 2. Database role + database (match docker-compose.yml credentials)
sudo -u postgres psql -c "CREATE ROLE bachatly LOGIN PASSWORD '<db-password>';"
sudo -u postgres psql -c "CREATE DATABASE bachatly OWNER bachatly;"

# 3. Install (repo root)
cd bachatly && pnpm install

# 4. Env for the database package (gitignored; DEV ONLY values)
cat > packages/database/.env <<'EOF'
DATABASE_URL="postgresql://bachatly:<db-password>@localhost:5432/bachatly"
EOF

# 5. Migrate + generate + seed
pnpm --filter @bachatly/database exec prisma migrate dev --name init
pnpm --filter @bachatly/database exec prisma generate
pnpm --filter @bachatly/database exec tsx prisma/seed.ts
# Seed creates: roles/permissions, cities/areas/categories, plans,
# demo users/businesses/deals, admin@bachatly.pk (see §8 — change the password)

# 6. API env (apps/api/.env — gitignored)
#    DATABASE_URL, REDIS_URL=redis://localhost:6379,
#    JWT_SECRET + JWT_REFRESH_SECRET (≥32 random chars)

# 7. Verify
pnpm --filter bachatly-api lint        # tsc --noEmit, must be 0 errors
pnpm --filter bachatly-web typecheck   # tsc --noEmit, must be 0 errors
pnpm --filter bachatly-api test        # jest unit suite (255 tests)
pnpm -r build
pnpm --filter bachatly-api start       # serves compiled API on :4000
```

Alternative (Docker, not re-verified this phase): `docker compose up -d`
for postgres/redis/minio, then steps 3–7 as above.

### Known environment quirks (this VM)

- `pnpm add` fails with EPERM chown errors on this filesystem — edit
  `package.json` directly, then run plain `pnpm install`.
- `redis-server` via systemd fails in containers (`217/USER`); the manual
  `redis-server --daemonize yes` works but **does not survive VM restarts** —
  re-run it after a reboot.
- One apt mirror (`mirror.cogentco.com`) was dead; the azure mirror works.
- API `pnpm start` runs `node dist/apps/api/src/main` — the `nest build`
  output nests under `dist/apps/api/src/` because package sources are
  compiled in via tsconfig path mappings. The start script already accounts
  for this; do not "simplify" it to `dist/main`.

## 3. Environment variables (production)

All from `.env.example` / `packages/config/src/env.ts` (zod-validated,
server-only — the web app receives **only** `NEXT_PUBLIC_*`):

| Var | Notes |
|---|---|
| `DATABASE_URL` | Managed Postgres 16, e.g. `postgresql://user:pass@host:5432/bachatly` |
| `REDIS_URL` | Redis 7 with AOP persistence (QR replay-set + rate limits live here) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥32 random bytes each. **The API refuses to boot in `NODE_ENV=production` without them** (fail-fast in `requiredSecret()`); dev falls back to a placeholder. |
| `PORT` | API port (default 4000). Web: 3000. |
| `CORS_ORIGINS` | Web domain only, comma-separated |
| `NEXT_PUBLIC_SITE_URL` | Canonical web URL (also used for referral links, sitemap) |
| `EMAIL_HOST/PORT/USER/PASSWORD/FROM` | SMTP for transactional email (verification, receipts) |
| `SMS_PROVIDER_KEY` / `WHATSAPP_PROVIDER_KEY` | **Stubs** — see §8 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | **Adapter stub** — see §8 |
| `JAZZCASH_*`, `EASYPAYSA_*`, `STRIPE_*` | Payment gateway keys — see §8 |
| `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Server key stays server-side |

## 4. Production deploy checklist

```bash
pnpm install --frozen-lockfile
pnpm --filter @bachatly/database exec prisma generate
pnpm --filter @bachatly/database exec prisma migrate deploy   # or: pnpm db:migrate:deploy
# DO NOT run the seed in production — onboard via the admin panel.
pnpm -r build
pnpm --filter bachatly-api start   # or pm2 / systemd (see below)
pnpm --filter bachatly-web start
```

- [ ] Secrets set (§3), ≥32-byte JWT secrets, rotated periodically
- [ ] `NODE_ENV=production` on the API (enables the secret fail-fast)
- [ ] Migrations run as a one-off job **before** new API replicas start
- [ ] Seed **not** run in prod; change/remove the seeded `admin@bachatly.pk`
      credentials immediately if a dev DB is ever promoted
- [ ] Refresh tokens are httpOnly + Secure + SameSite; access tokens short TTL
- [ ] CORS allowlist = web domain only; Throttler enabled (already wired)
- [ ] Payment webhooks HMAC/signature-verified (implemented in
      `payments.handleWebhook` — verify each gateway's secret is configured)
- [ ] File uploads: MIME + size validated; served from S3/CDN, never the API
- [ ] Backups: daily PostgreSQL PITR + S3 versioning; test restore quarterly
- [ ] `AuditLog` retained; admin access IP-allowlisted where possible
- [ ] Health: API serves `/api/v1/*`; docs at `/api/docs` (disable in prod
      via config if you don't want them public)

### process management (systemd example, API)

```ini
[Unit]
Description=bachatly-api
After=network.target postgresql.service redis-server.service

[Service]
WorkingDirectory=/srv/bachatly/apps/api
Environment=NODE_ENV=production
EnvironmentFile=/srv/bachatly/apps/api/.env
ExecStart=/usr/bin/node dist/apps/api/src/main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### In-app scheduled jobs (no external cron needed)

These run inside the API via `@nestjs/schedule` — ensure **exactly one**
API replica runs the scheduler in multi-replica deploys (or accept
at-most-once overlap; all jobs are idempotent):

| Schedule | Job |
|---|---|
| `@Cron(EVERY_HOUR)` | Referral qualification safety net (`referrals.service`) |
| `@Cron(EVERY_HOUR)` | Deal lifecycle (expiry/publish sweep, `deals.service`) |
| `@Cron(EVERY_DAY_AT_MIDNIGHT)` | Membership expiry sweep (`memberships.service`) |
| `@Cron('0 3 * * *')` | Membership expiry reminders (`memberships.service`) |
| `@Cron('5 0 * * 1')` | Weekly settlement run (`settlements.service`) |

## 5. Production topology (recommended)

```
Cloudflare/DNS → Nginx/Caddy (TLS) → web (Next.js) + api (NestJS, 2+ replicas)
                                    → PostgreSQL (managed, PITR backups)
                                    → Redis 7 (AOF on: QR jti replay-set, rate limits, cache)
                                    → S3-compatible bucket (images, receipts)
```

- Queue work (email/SMS/push dispatch, campaign sends) goes through the
  notification dispatch service; back it with Redis-backed retries in prod.
- Read replicas for analytics/report endpoints; Redis-cached deal/category
  listings with short TTL, invalidated on publish.
- Image optimization via Next.js Image + CDN in front of S3.

### nginx snippet (gzip at the proxy — the API does not compress in-process)

```nginx
http {
  gzip on; gzip_vary on; gzip_proxied any; gzip_comp_level 6;
  gzip_min_length 1024;
  gzip_types application/json application/javascript application/xml
             text/css text/plain image/svg+xml;
}
server {
  listen 443 ssl http2;
  server_name bachatly.pk;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Accept-Encoding $http_accept_encoding;
  }
  location / {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

Do **not** gzip already-compressed media (JPEG/PNG/WebP) — served from S3/CDN.

## 6. CI/CD (suggested)

```
install → lint → typecheck (api + web) → unit tests (jest, 255 tests, must be green)
  → build → migrate (staging) → deploy
```

Block deploys on failing tests. e2e specs under `apps/api/test/` are
scaffolding marked TODO — they need `DATABASE_URL_TEST` + Redis and are not
part of the green suite yet.

## 7. Security review notes (Phase 14, 2026-10-06)

- **Secret scan**: no hardcoded passwords/keys/tokens in `apps/*/src` or
  `packages/*/src`; the only `.env` on disk is the gitignored local-dev one.
- **JWT fail-fast (added this phase)**: `requiredSecret()` in
  `apps/api/src/common/utils/required-secret.ts` — missing `JWT_SECRET` /
  `JWT_REFRESH_SECRET` throws at boot when `NODE_ENV=production`.
- **AuthZ**: `JwtAuthGuard` + `RolesGuard` + `PermissionsGuard` are global
  `APP_GUARD`s — every route needs auth unless explicitly `@Public()`.
  Spot-checked: `users` (per-endpoint `@Permissions`), `payments` (admin
  role+permission; webhook `@Public()` **by design** with gateway signature
  verification in `handleWebhook`), `redemptions` (customer/staff/admin
  roles), `settlements` (admin/finance roles), `admin/*` (controller-wide
  admin roles).
- **Seed admin**: `admin@bachatly.pk` / `Bachatly@123` (SUPER_ADMIN, dev seed
  only — bcrypt-hashed). Rotate immediately if a seeded DB is ever promoted.
- **Seed PII**: all fictional (sequential test MSISDNs, invented brands).
- **Dependency audit**: `pnpm audit` could not run — the sandbox registry
  proxy denies `POST /-/npm/v1/security/audits` (policy block, not a code
  issue). Direct deps are current (NestJS 11, Next 14.2.13, jsonwebtoken 9,
  bcryptjs 2.4.3, ioredis 5, Prisma 5.22). Re-run `pnpm audit` in CI with
  normal registry access before launch.

## 8. Known limitations (not production-ready until resolved)

- **SMS/WhatsApp are stubs** (`sms-whatsapp.channel.ts`): interfaces exist,
  no provider is wired. Needs a provider account + `SMS_PROVIDER_KEY` /
  `WHATSAPP_PROVIDER_KEY` and a real implementation.
- **Payments**: JazzCash / Easypaisa / Stripe gateway classes exist but need
  real merchant keys and sandbox certification (`JAZZCASH_*`, `EASYPAISA_*`,
  `STRIPE_*`). Manual bank-transfer receipts are the working path today.
- **S3 adapter is a stub**: uploads work against local config in dev; point
  `S3_*` at a real bucket (or MinIO) before accepting uploads in prod.
- **Email** sends via SMTP only when `EMAIL_HOST` is set; otherwise the
  dispatch service records SKIPPED (never pretend-delivered) — check logs.
- **Tests**: 255/255 unit tests green (2026-10-06). e2e specs in
  `apps/api/test/` are TODO scaffolding (need `DATABASE_URL_TEST` + Redis);
  no browser/smoke coverage of the web app yet — manual QA recommended.
- **Web build output**: `pnpm -r build` is green; API `dist` nests under
  `dist/apps/api/src/` (documented in §2 quirks).
