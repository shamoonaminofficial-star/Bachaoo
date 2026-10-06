# Bachatly — Save More. Live More.

An original deals, discounts & membership marketplace, Pakistan-first and
multi-country ready. Members buy a membership, unlock exclusive discounts at
partner businesses, and redeem savings in-branch with a short-lived QR token.

## Architecture

```
                        ┌────────────────────────────────────┐
                        │        postgres:16 / redis:7       │
                        │   minio (S3-compatible uploads)    │
                        └──────────────▲─────────────────────┘
                                       │ (docker-compose.yml)
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
 ┌────────┴─────────┐        ┌──────────┴──────────┐      ┌─────────┴──────────┐
 │   apps/web       │        │      apps/api       │      │  packages/*        │
 │  (Next.js 14)    │ HTTP   │  (NestJS, /api/v1)  │ uses │  types / validation│
 │  port 3000       ├───────►│  port 4000          ├─────►│  config / database │
 └────────┬─────────┘        └──────────┬──────────┘      │  ui                │
          │                             │                 └────────────────────┘
          └────── shares packages/* ◄────┘
```

## Tech stack

| Layer        | Choice                                        |
| ------------ | --------------------------------------------- |
| Web          | Next.js 14 (App Router), Tailwind CSS         |
| API          | NestJS, `/api/v1` prefix, Swagger at `/api/docs` |
| Database     | PostgreSQL 16 + Prisma (`@bachatly/database`) |
| Cache/queues | Redis 7                                       |
| Uploads      | S3-compatible storage (MinIO in dev)          |
| Validation   | Zod via `@bachatly/validation`                |
| Types        | Shared TS types via `@bachatly/types`         |
| Env/tokens   | `@bachatly/config` (server env + design tokens) |
| Money        | Integer **paisa** (PKR), displayed as **Rs.**  |
| Timezone     | `Asia/Karachi`, default country `Pakistan`    |

## Quickstart

```bash
cp .env.example .env            # fill the secrets
docker compose up -d            # postgres + redis + minio
pnpm install
pnpm db:generate               # prisma client
pnpm db:migrate                # apply migrations
pnpm db:seed                    # seed cities, categories, demo plans
pnpm dev                        # web :3000 · api :4000
```

Ports: **web** `3000` · **api** `4000` · **MinIO console** `9001` ·
API docs (Swagger): `http://localhost:4000/api/docs`.

## Phase map

1. Architecture / design system / schema / env
2. Auth, users & roles
3. Categories, locations, businesses & branches
4. Deals, approval workflow & search
5. Memberships & payments
6. QR redemption & savings tracking
7. Customer dashboard
8. Partner dashboard
9. Admin dashboard
10. Vouchers, rewards, cashback & referrals
11. Notifications, reviews, support & CMS
12. Analytics, reports, commissions & settlements
13. SEO, performance & accessibility
14. Security, testing & deployment

## Financial rules

- **Integer paisa everywhere** — `MoneyPaisa` / `Paisa` is a `number` of
  paisa (PKR × 100). No floats in money paths; display as `Rs.` via the
  formatting helper.
- **Ledger immutability** — wallet/cashback transactions are append-only;
  corrections are new compensating entries, never updates or deletes.
- **Atomic settlement** — redemption confirm, wallet debit and commission
  accrual happen inside a single DB transaction.
- **Short-lived redemption tokens** — QR tokens expire in 60–120 s
  (`QR_TOKEN_TTL_SECONDS`, default `90`) and are single-use.

## Repo layout

```
apps/
  web/                 Next.js customer / partner / admin surfaces
  api/                 NestJS API — modules under src/modules/
packages/
  types/               Shared ApiResponse, enums-as-unions, money types
  validation/          Zod schemas for every request shape
  config/              Server env (zod-parsed) + design tokens (theme)
  database/            Prisma schema, migrations, seeds
  ui/                  Shared React components + design system
docker-compose.yml     postgres / redis / minio for local dev
turbo.json             build pipeline (dev / build / lint / typecheck / test)
```
