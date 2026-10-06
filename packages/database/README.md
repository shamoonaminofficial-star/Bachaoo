# @bachatly/database

Database layer for **Bachatly** ("Save More. Live More.") — a deals /
discounts / membership marketplace, Pakistan-first and multi-country ready.

Original design. Money is stored as **integer paisa** (Rs. 1 = 100 paisa);
display currency as `Rs.`. Default timezone `Asia/Karachi`, default country
Pakistan.

## Contents

- `prisma/schema.prisma` — full data model (PostgreSQL).
- `prisma/seed.ts` — development seed data (invented Pakistani demo brands).
- `src/index.ts` — re-exports `@prisma/client` + `createPrismaClient()` helper.

## Prerequisites

Set `DATABASE_URL` in the **repo root** `.env` (this package reads it from
there via the standard Prisma env resolution):

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/bachatly?schema=public"
```

Do **not** run `pnpm install` / `npm install` for the scaffold — the seed
script assumes dependencies are available when actually executed.

## Commands

Run these from the repo root (filter targets this workspace package):

```bash
# Generate the Prisma client from the schema
pnpm --filter @bachatly/database prisma:generate

# Apply migrations in development (creates a migration from schema changes)
pnpm --filter @bachatly/database prisma:migrate

# Seed the database with development demo data
pnpm --filter @bachatly/database prisma:seed

# Open Prisma Studio to browse data
pnpm --filter @bachatly/database prisma:studio
```

Or run inside `packages/database` directly:

```bash
cd packages/database
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

## Notes

- All model ids are UUID strings (`String @id @default(uuid()) @db.Uuid`).
- Every model has `createdAt` / `updatedAt`; major entities also have a
  soft-delete `deletedAt` column.
- `seed.ts` is **development only** — it is idempotent-ish (upserts / guards)
  so re-running it does not duplicate countries, cities, plans or the admin
  user. Never run it against production.
