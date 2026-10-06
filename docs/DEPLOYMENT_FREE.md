# Bachatly — FREE Deployment Guide (100% Muft)

Yeh guide tumhe **zero cost** pe Bachatly live karne ka poora tareeka batati hai.
Technical files (`render.yaml`, `apps/web/netlify.toml`) pehle se tayyar hain — tumhe sirf accounts banane aur buttons dabanay hain.

## Kya-kya free milega

| Hissa | Service | Free limit |
|---|---|---|
| Website (frontend) | Netlify | 100GB bandwidth/month |
| API server | Render | 750 hours/month, **15 min idle pe so jata hai** |
| Database (PostgreSQL) | Supabase | 500MB |
| Cache (Redis) | Upstash | 10,000 commands/day |
| Uptime pinger | UptimeRobot | 50 monitors |

## Step 0 — Code GitHub pe dalo (5 min)

Tumhare laptop pe:

```bash
cd ~/workspace/bachatly   # ya jahan code hai
git init
git add .
git commit -m "Bachatly launch"
# GitHub pe naya repo banao (github.com → New repository), phir:
git remote add origin https://github.com/TUMHARA-USERNAME/bachatly.git
git push -u origin main
```

## Step 1 — Supabase (Database) — 5 min

1. [supabase.com](https://supabase.com) → Sign up (GitHub se login easiest)
2. **New project** → naam `bachatly`, password note kar lo, region **Singapore** (Pakistan ke sab se qareeb)
3. Project khulne ke baad: **Settings → Database** → **Connection string** → **URI** tab
4. Pooler wali string copy karo — is format ki hogi:
   ```
   postgresql://postgres.xxxxx:[TUMHARA-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   `[TUMHARA-PASSWORD]` ki jagah apna password likho. **Yeh `DATABASE_URL` hai — sambhal ke rakho.**

## Step 2 — Upstash (Redis) — 3 min

1. [upstash.com](https://upstash.com) → Sign up
2. **Create Database** → naam `bachatly-redis`, region Singapore
3. **Details** page se **Redis URL** copy karo:
   ```
   rediss://default:xxxx@xxxx.upstash.io:6379
   ```
   **Yeh `REDIS_URL` hai.**

## Step 3 — Render (API server) — 10 min

1. [render.com](https://render.com) → Sign up (GitHub se)
2. **New → Web Service** → apna `bachatly` repo connect karo
3. Settings:
   - **Name:** `bachatly-api`
   - **Runtime:** Node
   - **Build Command:** (render.yaml se auto aayega, warna manually)
     ```
     pnpm install && pnpm --filter @bachatly/database prisma:migrate:deploy && pnpm --filter bachatly-api build
     ```
   - **Start Command:**
     ```
     node apps/api/dist/apps/api/src/main
     ```
   - **Plan:** Free
4. **Environment variables** add karo:
   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Step 1 wali string |
   | `REDIS_URL` | Step 2 wali string |
   | `JWT_SECRET` | koi lambi random string (khud bana lo, 32+ characters) |
   | `JWT_REFRESH_SECRET` | doosri lambi random string |
   | `CORS_ORIGINS` | `https://tumhari-site.netlify.app` (Step 4 ke baad update karna) |
   | `FRONTEND_URL` | `https://tumhari-site.netlify.app` (Step 4 ke baad update karna) |
5. **Deploy** dabao — 5-10 minute lagega. End mein **migrations automatically** chal jayengi.
6. Deploy hone ke baad tumhe URL milega: `https://bachatly-api.onrender.com`
   Test karo: `https://bachatly-api.onrender.com/api/v1/healthz` → `{"status":"ok"...}` aana chahiye.

> **Seed data (demo businesses/deals):** apne laptop se ek dafa chalao (sirf pehli dafa):
> ```bash
> DATABASE_URL="<supabase-string>" pnpm --filter @bachatly/database prisma:seed
> ```
> ⚠️ Seed mein `admin@bachatly.pk / Bachatly@123` banta hai — **live jaane se pehle password zaroor badlo.**

## Step 4 — Netlify (Website) — 10 min

1. [netlify.com](https://netlify.com) → Sign up (GitHub se)
2. **Add new site → Import an existing project** → `bachatly` repo select karo
3. Build settings (`netlify.toml` se auto aayengi):
   - **Build command:** `pnpm --filter @bachatly/web build`
   - **Publish directory:** `apps/web/.next`
4. **Environment variables** (Site settings → Environment):
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://bachatly-api.onrender.com` (Step 3 wala URL) |
   | `NEXT_PUBLIC_SITE_URL` | `https://tumhari-site.netlify.app` |
5. **Deploy** — site live: `https://tumhari-site.netlify.app`

## Step 5 — Dono ko joro (2 min)

1. Render → `bachatly-api` → Environment → `CORS_ORIGINS` aur `FRONTEND_URL` mein apni **asal Netlify URL** likho → **Save** (auto redeploy)
2. Website kholo → login/signup test karo. Kaam kare toh done! 🎉

## Step 6 — Render ko sone na do (3 min) — ZAROORI

Render free 15 min idle pe so jata hai. [uptimerobot.com](https://uptimerobot.com) → free account → **Add Monitor**:
- **Type:** HTTP(s)
- **URL:** `https://bachatly-api.onrender.com/api/v1/healthz`
- **Interval:** 10 minutes

Ab API hamesha jaagti rahegi.

## Step 7 — Apna domain lagao (jab domain khareedo)

1. Netlify → Site settings → **Domain management → Add custom domain** → apna domain likho
2. Domain registrar (Namecheap/PK-Domains/GoDaddy) pe DNS mein Netlify ke diye hue records add karo
3. Netlify free mein **HTTPS (SSL)** khud laga dega
4. Phir Render pe `CORS_ORIGINS`/`FRONTEND_URL` aur Netlify pe `NEXT_PUBLIC_SITE_URL` ko naye domain pe update karo

## Free limits — kab upgrade karna hai

- **Render free → $7/month:** jab roz ke users aane lagen (cold start khatam, hamesha fast)
- **Supabase 500MB:** hazaron users/deals tak kaafi hai
- **Upstash 10k/day:** shuru mein kaafi hai
- **Netlify 100GB:** lakhon page views tak kaafi hai

## Yaad rakhne wali baatein

- `.env` wali secrets **kabhi GitHub pe mat dalo** — sirf Render/Netlify ke dashboard mein
- Launch se pehle: seed admin password badlo, `JWT_SECRET` lambi random strings rakho
- SMS/WhatsApp OTP aur JazzCash/Easypaisa ke liye provider accounts ab bhi chahiye honge (woh free nahi)
- Koi error aaye toh Render/Netlify ke **Logs** tab mein dekho — error copy karke mujhe bhej dena, main fix kar dunga
