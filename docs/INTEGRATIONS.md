# Integrations setup

Every integration is optional, and the CRM works fully without them. Configure them in this order of value.

## 1. WhatsApp Cloud API (Meta)

1. Create a Meta Business account and a **WhatsApp Business** app at developers.facebook.com, and add a phone number.
2. Create a **System User** with the `whatsapp_business_messaging` and `whatsapp_business_management` permissions, then generate a **permanent token**.
3. In Zeedra Solar, go to **Settings → Integrations → WhatsApp** and enter the *Phone number ID*, *WhatsApp Business Account ID* and the token.
4. Webhook (Meta app → WhatsApp → Configuration):
   - Callback URL: `https://YOUR_DOMAIN/api/webhooks/whatsapp`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN` in your environment
   - Subscribe to `messages`
   - Recommended: set `WHATSAPP_APP_SECRET` so payload signatures are verified.
5. **Templates outside the 24-hour window.** Meta only lets you start a conversation with an *approved template*. For each Zeedra Solar template you use in automations (`welcome`, `appointment_reminder`, `followup_nudge` …), create a matching template in WhatsApp Manager, then enter its name in **Settings → WhatsApp templates → Approved Meta template name**. The variables (`{{name}}`, `{{kw}}` …) are sent as body parameters in the order they appear in the Zeedra Solar text, so write the Meta template with `{{1}}`, `{{2}}`… in the same order.

Inbound messages from unknown numbers create leads automatically (source = WhatsApp). Delivery and read receipts update message ticks.

## 2. Google Calendar

1. In Google Cloud Console, create an **OAuth 2.0 Client ID** (type *Web application*).
2. Authorized redirect URI: `https://YOUR_DOMAIN/api/integrations/google/callback`
3. Enable the **Google Calendar API**. On the consent screen, add the scopes `calendar.events` and `calendar.freebusy`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart.
5. Each salesperson connects their own calendar from **My profile → Connect my Google Calendar**.

Booked visits are created on the salesperson's calendar with the customer as an attendee when an email is known. Reschedules and cancellations sync, and free/busy blocks those slots in the booking dialog.

## 3. Claude AI

Set `ANTHROPIC_API_KEY`. `AI_MODEL` defaults to `claude-opus-5-5`. AI powers:
- **EB-bill scanning:** a photo or PDF fills units, amount, sanctioned load, DISCOM and consumer number, and bi-monthly bills are converted to monthly.
- **Lead co-pilot:** summary, why Hot/Warm/Cold, next best action, objection talk-track, and a ready WhatsApp message.
- **WhatsApp reply drafts** in the customer's language (English, Tamil, Hindi, Hinglish).
- **Daily sales brief** on the dashboard.

Requests use structured outputs and the server-side refusal fallback (`fallbacks: "default"`), with per-organisation rate limits.

## 4. Lead sources

**Website or landing page.** Each workspace gets a hosted page at `https://YOUR_DOMAIN/p/<org-slug>` with an instant estimate. Add `?utm_source=facebook&utm_campaign=diwali` to attribute ads.

**API** (Facebook Lead Ads via Zapier/Make, IndiaMART/JustDial push, your own site):

```bash
curl -X POST https://YOUR_DOMAIN/api/public/leads \
  -H "x-api-key: <Settings → Integrations → API key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ravi Kumar","phone":"9876543210","city":"Chennai","monthlyBill":3200,
       "ownsProperty":true,"source":"FACEBOOK","campaign":"Diwali"}'
```

Accepted fields: `name`*, `phone`*, `email`, `city`, `pincode`, `address`, `segment`, `monthlyBill`, `monthlyUnits`, `ownsProperty`, `roofType`, `source`, `campaign`, `lat`, `lng`. The response includes the lead reference and an instant estimate. Duplicates (same phone) are merged.

**CSV import** (Leads → Import) accepts Facebook, IndiaMART and Excel exports. Headers are matched automatically.

## 5. Scheduler

Time-based automations (visit reminders, re-engagement and quotation expiry) run when something calls:

```
POST /api/cron/run
Authorization: Bearer $CRON_SECRET
```

every 5–15 minutes. `vercel.json` and `docker-compose.yml` are pre-configured. Alternatives are cron-job.org, GitHub Actions, or a system crontab:

```
*/10 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/run
```
