# ☀️ Zeedra Solar: AI-powered CRM for solar installers

**Built by Sirah Digital in collaboration with Zeedra Digital.**

Zeedra Solar runs the whole rooftop-solar sales cycle for Indian EPCs, from the first enquiry to the PM Surya Ghar subsidy credit:

- **Every lead, every channel.** Website landing page, API (Facebook Lead Ads, IndiaMART, JustDial), WhatsApp inbound and CSV import. Duplicates are merged and new leads are auto-assigned round-robin.
- **Two-stage qualification.** *Basic* (EB bill and property ownership, plus roof checks) and *Sales* (site-visit readiness, installation timeline, finance), producing an explainable Hot / Warm / Cold score with the next best action.
- **EB bill → system in seconds.** kWp, panels, inverter, roof area, cost with GST, PM Surya Ghar subsidy, savings, payback and EMI. Snap the bill and **AI reads it**.
- **Finance built in.** When money is the objection, the loan route is tracked (docs → applied → sanctioned) and the customer sees EMI against monthly savings.
- **Google Calendar booking.** Conflict-free slots with travel buffers, synced to each salesperson's calendar, with WhatsApp confirmation and reminders 24 h and 2 h before.
- **WhatsApp automation.** Welcome message, instant estimate, visit confirmation, reminders, loan offers, re-engagement and quotation links, from an editable rules engine.
- **GPS-verified field sales.** Check-ins and quotations prove *who* quoted *whom*, *where* and *when*: geofence, appointment slot, device-clock tampering and impossible-travel (mock GPS) detection, with a manager review queue.
- **Professional proposals.** A server-priced bill of materials, a 25-year savings view and a secure customer link with view tracking.
- **Installations.** Booking → PM Surya Ghar portal → DISCOM feasibility → installation → net-meter → commissioning → subsidy, with a document checklist and payment tracking.
- **AI co-pilot** (Claude). Lead coaching, reply drafting and a daily manager brief. Every AI feature has a rule-based fallback.
- **Self-serve SaaS.** Public marketing site and pricing page, 14-day free trial with no card required, plan-based seat/lead limits, and a Settings → Billing panel the workspace owner manages themselves (`src/lib/billing/plans.ts`).

## Go-to-market

- `/` — public marketing homepage (feature tour + an honest comparison against Arka360 and Solar Ladder).
- `/pricing` — self-serve plans (Starter / Growth / Scale + Enterprise), monthly/yearly toggle.
- `/register` — creates a workspace and starts the trial; no payment gateway is wired yet, so "upgrading" in Settings → Billing records the chosen plan and our team follows up to collect payment (see `docs/DEPLOYMENT.md`).

## Quick start (local)

Requires Node 20.11+.

```bash
npm install
cp .env.example .env         # then set AUTH_SECRET (and DEMO_MODE="true" for one-click demo logins)
npm run setup                # generate client, create SQLite DB, load demo data
npm run dev                  # http://localhost:3000
```

Demo workspace *Zeedra Solar Solutions* (password `Demo@12345`):

| Role | Email |
|---|---|
| Owner | owner@zeedra.demo |
| Sales manager | manager@zeedra.demo |
| Tele-caller | telecaller@zeedra.demo |
| Field sales (use a phone) | field@zeedra.demo |
| Installer | installer@zeedra.demo |

Public landing page: `http://localhost:3000/p/zeedra-solar`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | 53 unit tests: sizing, subsidy, EMI, qualification, scoring, GPS validation, scheduling, automations, billing plans |
| `npm run test:e2e` | 116-check end-to-end suite against a running server (all roles, full lead → project flow, RBAC, tenant isolation, webhooks, cron) |
| `npm run test:ui` | Real-browser check (Playwright) of every page on desktop and mobile; fails on console errors, hydration mismatches or horizontal overflow; saves screenshots |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:seed` | Reload the demo tenant |
| `npm run db:postgres` / `db:sqlite` | Switch the Prisma provider |

## Documentation

- [Architecture & business design](docs/ARCHITECTURE.md): the sales process, scoring model, sizing maths, GPS validation, automation playbook, security and data model
- [Integrations](docs/INTEGRATIONS.md): WhatsApp Cloud API, Google Calendar, Claude, lead sources and the scheduler
- [Deployment](docs/DEPLOYMENT.md): Docker/VPS, Vercel + Postgres, migrations and the go-live checklist
- [User guides](docs/user-guides/README.md): plain-English, screenshot-led guides for each role (Owner, Admin, Sales Manager, Tele-caller, Field Sales, Installer). The same content is also built into the app under **Help & guide**.

## Tech

Next.js 15 · React 19 · TypeScript · Prisma 6 (PostgreSQL / SQLite) · Tailwind CSS · Leaflet + OpenStreetMap · Recharts · Anthropic Claude · WhatsApp Cloud API · Google Calendar API.

---

© Sirah Digital × Zeedra Digital. Product name and branding are configurable in `src/lib/brand.ts`.
