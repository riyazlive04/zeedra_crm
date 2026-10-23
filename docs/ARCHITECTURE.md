# Zeedra Solar — Architecture & Business Design

*Solar CRM SaaS by Sirah Digital in collaboration with Zeedra Digital.*

This document covers the business analysis behind the product (who uses it, which pains it removes, how the sales process is modelled) and the technical architecture that implements it.

---

## 1. Business analysis

### 1.1 The market problem

Indian rooftop-solar EPCs (from 3-person installers to multi-city players like Tata Power Solaroof's channel partners) run on spreadsheets, personal WhatsApp and phone calls. The PM Surya Ghar Muft Bijli Yojana scheme has driven a surge in enquiries, and the bottlenecks have moved:

| Pain | What it costs the installer |
|---|---|
| Leads arrive from 8+ channels (Facebook, Google, IndiaMART, JustDial, website, WhatsApp, walk-ins, referrals) and are typed into Excel by hand | Slow first response. The first installer to call usually wins. |
| No consistent qualification: tele-callers book visits for tenants and ₹600/month bills | Field salespeople waste half their day |
| Sizing, subsidy and EMI are computed on a calculator during the call | Inconsistent numbers and lost trust |
| Site visits are booked over the phone with no shared calendar | Double bookings and no-shows |
| Salespeople claim visits they never made and fill in quotations from home | No proof of field work; customers are quoted without a roof survey |
| No one follows up after the quotation | 30–50% of warm leads silently die |
| Post-sale: portal registration, DISCOM feasibility, net-meter and subsidy are tracked on paper | Delayed subsidy, angry customers, stuck receivables |

### 1.2 Personas & roles

| Role | Lives in | Primary jobs |
|---|---|---|
| **Owner / Admin** | Dashboard, Settings | Pricing, team, integrations, business health |
| **Sales Manager** | Dashboard, Pipeline, Field Tracking | Assign leads, review flagged quotations, coach |
| **Tele-caller** | Leads, WhatsApp, Appointments | First call, basic + sales qualification, book visits |
| **Field Sales** | Field App (mobile) | Visit, GPS check-in, roof survey, on-site quotation |
| **Installer / Project Manager** | Installations | Execute the project through to subsidy credit |

Access is enforced server-side through a permission matrix (`src/lib/rbac.ts`). Field sales and installers only see leads and projects assigned to them.

### 1.3 The sales process as modelled

```
Lead captured ──► Basic qualification ──► Sales qualification ──► Site visit ──► Quotation ──► Won ──► Installation project
 (any channel)    EB bill + ownership      Hot / Warm / Cold        GPS check-in   GPS + time     │       portal → DISCOM → install
  de-duplicated   + roof → pass/fail       visit/install readiness  Google Cal.    validated      │       → net-meter → subsidy
  auto-assigned   (auto-sized system)      finance → loan route                    WhatsApp link  │
  WhatsApp hello  WhatsApp estimate        hot-lead alerts           reminders     view tracking  └► Lost (reason required)
```

**Stage 1: basic qualification** (`basicQualification` in `src/lib/qualification.ts`)
- Monthly bill ≥ threshold (residential default ₹1,200, commercial ₹5,000; configurable). Units can substitute for the bill.
- Owns the property. Residential tenants are disqualified by default; commercial tenants pass with an "owner NOC" warning.
- Roof area must fit at least 1 kW. Asbestos, tiled and shaded roofs produce warnings for the site survey.
- Result: `QUALIFIED`, `DISQUALIFIED` (with reasons) or `INCOMPLETE` (with the missing fields).

**Stage 2: sales qualification** (`salesScore`). This is a deterministic, explainable 0–100 score:

| Signal | Points |
|---|---|
| Installation timeline | Immediate 30 · ≤1 month 24 · 1–3 months 15 · 3–6 months 6 · exploring 0 |
| Site-visit readiness | Ready 20 · unknown 5 · not ready 0 |
| Financial readiness | Cash/budget confirmed 20 · loan sanctioned 20 · applied 15 · docs pending 10 · not started 8 · undecided 3 |
| Bill size (deal value) | 2–15 |
| Decision-maker engaged | 8 |
| Recent engagement | ≤3 days 7 · ≤7 days 4 |
| Objection penalty | price/finance −5, roof −10, ownership −20 … |

Hot ≥ 70, Warm ≥ 40 (configurable). Failing basic qualification caps the score at 15. Each objection maps to a playbook action. A **finance** objection, for example, routes to the PM Surya Ghar collateral-free loan (~7%) and shows EMI against monthly savings.

AI (Claude) adds narrative coaching **on top of** the score. The temperature itself always comes from the reproducible rule engine, so managers can trust and audit it.

### 1.4 Solar sizing & commercials (`src/lib/solar/`)

1. Units = given units, or `(bill − fixed charges) ÷ tariff`.
2. Required kWp = `units × 12 × offset ÷ specific yield` (default 1,400 kWh/kWp/yr), rounded to 0.5 kW.
3. Capped to the roof (`area ÷ 100 sq.ft/kW`). Warnings for sanctioned load, single-phase above 5 kW, and residential systems above 10 kW.
4. Panels = `ceil(kW × 1000 ÷ wattage)`; the DC capacity quoted is `panels × wattage`. The inverter is the nearest standard size at or above 90% of DC.
5. Price = DC kW × slab rate (pre-GST) − discount + GST (8.9% composite: 70% goods at 5% plus 30% services at 18%).
6. **PM Surya Ghar subsidy**: ₹30,000/kW up to 2 kW, ₹18,000 for the 3rd kW, capped at ₹78,000. Housing societies get ₹18,000/kW up to 500 kW. An optional state top-up is configurable.
7. Savings = self-consumed units × tariff + exported units × export rate. Payback is net cost ÷ annual savings, and 25-year savings include degradation and tariff escalation.
8. EMI is reducing-balance, compared across tenures against monthly savings ("EMI below your bill").

Every quotation is priced **on the server**. The device sends only the configuration, so a salesperson cannot edit numbers on their phone.

### 1.5 Field-sales validation: who, where, when (`src/lib/geo.ts`)

Every check-in and field quotation captures a fresh high-accuracy GPS fix and the device clock. The server then runs:

| Check | Fails as | Purpose |
|---|---|---|
| A GPS fix exists | `NO_GPS` | Location services were turned off |
| Device clock within ±5 min of the server | `CLOCK_TAMPER` | Back-dated phones, offline replays |
| Speed since the last ping ≤ 120 km/h | `IMPOSSIBLE_TRAVEL` | Mock-location / GPS-spoofing apps |
| Distance to the confirmed site pin ≤ geofence (200 m, plus up to half the accuracy) | `OUT_OF_RANGE` | Quote made away from the roof |
| GPS accuracy ≤ 100 m | `LOW_ACCURACY` | Untrustworthy reading |
| Inside the appointment window (−60 / +180 min) | `TIME_MISMATCH` | Quote made at another time than the visit |
| Site pin confirmed by a manager | `SITE_UNPINNED` | First visit; the pin itself needs approval |

The verdict is the most severe failing check, and every flag plus every check's detail is stored with the quotation. Server time is authoritative. The site pin is the reference point and only managers can confirm it, which prevents a salesperson from "moving the house" to wherever they are. Flagged quotations trigger a manager notification and appear in **Field Tracking**, where a manager can approve (optionally confirming the pin from the capture) or reject. The leaderboard shows each salesperson's GPS-verified percentage.

### 1.6 Automation playbook (default, editable)

| When | If | Then |
|---|---|---|
| Lead created | — | WhatsApp welcome + "Call new lead" task (1 h) |
| Lead qualifies | — | WhatsApp instant estimate (kW, subsidy, net cost, savings, EMI) |
| Temperature changes | becomes HOT | Alert managers and owner + "Book site visit" task (4 h) |
| Temperature changes | objection = Finance | WhatsApp loan/EMI offer |
| Appointment booked | site visit | WhatsApp confirmation (salesperson, date, time) |
| 24 h and 2 h before a visit | — | WhatsApp reminder |
| Quotation flagged | — | Notify managers |
| Quotation sent | — | WhatsApp with secure proposal link + 48 h follow-up task |
| 3 days of silence | Hot/Warm | WhatsApp nudge + call task |
| Quotation expiring in 2 days | — | WhatsApp urgency + task |
| Stage → Won | — | Welcome and next-steps message |

Each rule fires at most once per reference through an idempotency ledger (`AutomationRun`). Failures are recorded and never block the user action.

---

## 2. Technical architecture

### 2.1 Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15** (App Router, React 19, TypeScript strict) | One deployable unit: server components for data-heavy pages, route handlers for the API |
| Data | **Prisma 6** on **PostgreSQL** (prod) / SQLite (dev) | Typed queries; migrations; zero-setup local dev |
| Auth | JWT session cookie (`jose`, HS256, httpOnly, 7 days) + bcrypt | Edge-verifiable in middleware; role re-read from the DB on every API call so revocation is immediate |
| UI | Tailwind CSS, lucide icons, Recharts, Leaflet + OpenStreetMap | Fast, professional, no map licence cost |
| AI | Anthropic **Claude** (`claude-opus-5-5`) with structured outputs and server-side refusal fallback | Lead coaching, EB-bill vision extraction, reply drafting, daily brief |
| Messaging | Meta **WhatsApp Cloud API** | Official API, templates for outside the 24 h window, delivery receipts |
| Calendar | **Google Calendar** REST via per-user OAuth | Events on each salesperson's calendar; free/busy for slots |
| Scheduling | `/api/cron/run`, called by any scheduler | Works on Vercel Cron, docker-compose, GitHub Actions or crontab |

### 2.2 Module map

```
src/
  middleware.ts                 session gate for pages & APIs
  instrumentation.ts            pins server timezone (IST)
  lib/
    settings.ts                 tenant business config (zod schema + defaults)
    qualification.ts            stage 1 & stage 2 engines            ← pure, unit-tested
    solar/sizing.ts finance.ts  sizing, subsidy, ROI, EMI             ← pure, unit-tested
    solar/quote.ts              bill of materials, terms              ← pure
    geo.ts                      GPS/time validation engine            ← pure, unit-tested
    scheduling.ts               timezone-aware slot generation        ← pure, unit-tested
    automation/types.ts         triggers, conditions, actions         ← shared client/server
    automation/engine.ts        rule execution + scheduled automations
    services/                   leads, appointments, field, projects, dashboard, tenant
    ai.ts whatsapp.ts google-calendar.ts   integrations (all optional)
    auth.ts session.ts rbac.ts api.ts rate-limit.ts activity.ts
  app/
    (app)/…                     authenticated product pages
    api/…                       JSON API (route handlers)
    p/[slug]                    public lead-capture landing page
    q/[token]                   customer-facing proposal
```

The **domain engines are pure functions** with no database or network access. The same code runs in the browser (instant estimates as you type), on the server (authoritative pricing and validation) and in the tests.

### 2.3 Multi-tenancy & security

- Every business table carries `organizationId`, and every query is scoped by the session's organisation. `leadScope()` adds per-user scoping for field and installer roles. The e2e suite verifies that another tenant gets 404s.
- Passwords are bcrypt (cost 11), with timing-uniform login. Login, signup, public lead capture, AI and pings are rate-limited by a DB-backed limiter that works across instances.
- Proposal links use 144-bit random share tokens, not database IDs. The cron endpoint uses a constant-time secret comparison. WhatsApp webhooks verify `X-Hub-Signature-256` when an app secret is set.
- The CSV export neutralises spreadsheet formula injection. Security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, a Permissions-Policy allowing only geolocation and camera) are set in `next.config.mjs`.
- An audit log records logins, exports, imports, deletions and settings and user changes.
- The WhatsApp access token is write-only from the UI: it is never sent back to the browser.

### 2.4 Data model (17 tables)

`Organization` (with `settings` JSON) → `User` · `Lead` → `Activity`, `Task`, `Appointment`, `Quotation`, `WhatsAppMessage`, `Project` · `MessageTemplate` · `AutomationRule` + `AutomationRun` · `LocationPing` · `Notification` · `AuditLog` · `Counter` (per-tenant sequences such as LD-00001 and QT-2026-00001) · `RateLimit`.

See `prisma/schema.prisma`. Indexes cover the hot paths: leads by stage, temperature, assignee, phone and created date; appointments by assignee and time; quotations by verdict.

### 2.5 Failure modes by design

| Dependency missing | Behaviour |
|---|---|
| No Anthropic key | Rule-based insight, reply drafts and brief. Bill scanning shows a clear "enable AI" message |
| WhatsApp not connected | Messages are logged as *Simulated* with a one-tap wa.me link to send from the phone |
| Google not connected | Appointments are still booked internally, with clash detection; the sync error is shown on the event |
| Scheduler not running | Event automations still fire; only reminders, nudges and expiry wait |
| Automation action fails | Recorded in `AutomationRun` and shown on the rule card; the user's action still succeeds |

### 2.6 SaaS: plans, trial & billing

`src/lib/billing/plans.ts` is the single source of truth for the three plans (Starter, Growth, Scale), read by the public pricing page, the Settings → Billing panel and the seat-limit check on `POST /api/users`. New workspaces (`provisionOrganization`) start on a 14-day trial (`Organization.billingStatus = "TRIALING"`, `trialEndsAt`). The app shell shows a banner once a trial has 5 days or fewer left, or after it expires; past expiry, new seats beyond the Starter limit are blocked with a 402 until the owner picks a plan. Lead volume is shown as a usage meter but never blocks lead capture — the public lead-capture funnel must never silently drop a lead. No payment gateway is wired yet: choosing a plan in Settings → Billing (owner-only) records `plan`/`billingStatus` directly, and billing follow-up is manual (see `docs/DEPLOYMENT.md`).

### 2.7 Scaling path

- Stateless app servers scale horizontally (sessions are JWT; the rate limiter lives in the DB).
- Move the cron to a queue worker (BullMQ/SQS) when tenants exceed a few thousand appointments a day.
- Add read replicas for dashboards, and archive `LocationPing`/`Activity` after 12 months.
- Use object storage (S3/R2) for bill photos and installation photos when document upload is added.
