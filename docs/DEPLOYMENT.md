# Deployment

Sirah × Zeedra Solar is a single Next.js application plus a PostgreSQL database. Choose one option below.

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

## Option B: Vercel + managed Postgres (Neon, Supabase, RDS)

1. Run `npm run db:postgres` and commit the provider change (the build uses the schema as committed).
2. Set the build command to `prisma generate && prisma migrate deploy && next build`.
3. Add the environment variables. `vercel.json` schedules `/api/cron/run` every 15 minutes (Vercel Pro), and Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

SQLite is for local development only. It does not work on serverless platforms.

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

## Operations

- **Logs:** unhandled API errors are logged with the `[api] unhandled` prefix. Users see a generic message.
- **Health:** `/api/health` (DB check) is used by the Docker `HEALTHCHECK`.
- **Scaling:** the app is stateless, so run multiple replicas behind a load balancer.
