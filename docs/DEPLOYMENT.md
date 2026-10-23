# Deployment

Zeedra Solar is a single Next.js application plus a PostgreSQL database. Choose one option below.

## Required environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/zeedra?schema=public` |
| `AUTH_SECRET` | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | Public URL, e.g. `https://crm.yourcompany.in`, used in WhatsApp links and OAuth redirects |
| `CRON_SECRET` | Random string, also configured in your scheduler |
| `WHATSAPP_VERIFY_TOKEN` | Random string, entered in the Meta webhook config |
| `APP_TIMEZONE` | Defaults to `Asia/Kolkata` |
| `DEMO_MODE` | Must be `false` (or unset) in production |
| Optional | `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WHATSAPP_APP_SECRET` |

## Option A: Docker / any VPS (recommended for India: AWS Mumbai, DigitalOcean Bangalore, E2E Networks)

```bash
cp .env.example .env        # fill the values above (DATABASE_URL is set by compose)
docker compose up -d --build
```

This starts PostgreSQL, the app (migrations run on start) and a scheduler that triggers automations every 5 minutes. Put Caddy or Nginx in front for HTTPS. Geolocation in the Field App **requires HTTPS**.

## Option B: Vercel + Neon Postgres

1. In Vercel, choose **Add New → Project**, import the GitHub repository and keep the defaults. The `vercel-build` script switches Prisma to PostgreSQL, applies migrations and builds.
2. Under **Storage → Create Database → Neon (Postgres)**, connect it to the project. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used for migrations) automatically.
3. Under **Settings → Environment Variables**, add `AUTH_SECRET`, `CRON_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and `APP_URL` (your `https://….vercel.app` URL), plus any optional keys. Redeploy.
4. **Scheduler:** `vercel.json` runs `/api/cron/run` once a day, which is all the Hobby plan allows. For the 2-hour and 24-hour visit reminders, add the GitHub repository secrets `APP_URL` and `CRON_SECRET`. The included `Scheduler` workflow then calls it every 10 minutes. On Vercel Pro you can instead change the `vercel.json` schedule to `*/10 * * * *`.
5. Open `/register` to create your workspace.

SQLite is for local development only. It does not work on Vercel.

## Database migrations

- Production uses `prisma/migrations` (PostgreSQL) via `prisma migrate deploy`.
- After changing `schema.prisma`, run `npm run db:postgres && npx prisma migrate dev --name <change>` against a Postgres dev database, then `npm run db:sqlite` to switch back to local dev.

## Post-deploy checklist

- [ ] `GET /api/health` returns `{"status":"ok","db":"up"}`
- [ ] Register the first workspace at `/register`, then invite the team (Settings → Team)
- [ ] Settings → Pricing: your tariff, price slabs, state subsidy and panel/inverter brands
- [ ] Settings → Integrations: WhatsApp, the API key for ad platforms, and the landing-page link
- [ ] Each salesperson connects Google Calendar from their profile
- [ ] The scheduler is calling `/api/cron/run` (check the "Ran N times" counter on reminder automations)
- [ ] Back up Postgres daily (e.g. `pg_dump` cron, or managed backups)
- [ ] Billing: no payment gateway is wired yet. Settings → Billing lets an owner self-select a plan (`Organization.plan`/`billingStatus`); wire Razorpay Subscriptions (or similar) before relying on it to actually collect payment, and until then follow up on new "upgrades" manually

## Operations

- **Logs:** unhandled API errors are logged with the `[api] unhandled` prefix. Users see a generic message.
- **Health:** `/api/health` (DB check) is used by the Docker `HEALTHCHECK`.
- **Scaling:** the app is stateless, so run multiple replicas behind a load balancer.
