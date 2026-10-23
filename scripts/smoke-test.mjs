#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Zeedra Solar server with the demo seed loaded.
 *   npm run db:reset && npm run build && npm start   (in another terminal)
 *   BASE_URL=http://localhost:3000 CRON_SECRET=... npm run test:e2e
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "change-me-cron-secret";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "change-me-verify-token";
const PW = "Demo@12345";

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 300)}` : ""}`);
  }
}
const section = (t) => console.log(`\n▸ ${t}`);

class Client {
  constructor() {
    this.cookie = "";
  }
  async req(path, { method = "GET", body, headers = {}, raw = false } = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" || body instanceof FormData ? body : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = raw ? await res.text() : type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  async login(email) {
    const r = await this.req("/api/auth/login", { method: "POST", body: { email, password: PW } });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
    return this;
  }
}

const near = (lat, lng, m) => ({ lat: lat + m / 111_320, lng });
const rndPhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

async function main() {
  console.log(`Zeedra Solar smoke test → ${BASE}`);

  section("Platform");
  const anon = new Client();
  const health = await anon.req("/api/health");
  check("health endpoint is up with DB", health.status === 200 && health.data.db === "up", health.data);
  check("unauthenticated API → 401", (await anon.req("/api/leads")).status === 401);
  const redirect = await anon.req("/dashboard");
  check("unauthenticated page → redirect to /login", [302, 307].includes(redirect.status) && (redirect.headers.get("location") ?? "").includes("/login"));
  check("wrong password → 401", (await anon.req("/api/auth/login", { method: "POST", body: { email: "owner@zeedra.demo", password: "nope" } })).status === 401);
  check("security headers present", health.headers.get("x-content-type-options") === "nosniff" && !!health.headers.get("x-frame-options"));

  const owner = await new Client().login("owner@zeedra.demo");
  const manager = await new Client().login("manager@zeedra.demo");
  const tele = await new Client().login("telecaller@zeedra.demo");
  const demoField = await new Client().login("field@zeedra.demo");
  const installer = await new Client().login("installer@zeedra.demo");

  section("Every page renders for the owner");
  const pages = ["/dashboard", "/leads", "/leads/new", "/pipeline", "/appointments", "/tasks", "/whatsapp", "/field", "/quotations", "/tracking", "/projects", "/automations", "/calculator", "/help",
    ...["company", "pricing", "qualification", "field", "schedule", "team", "templates", "integrations", "profile"].map((t) => `/settings?tab=${t}`)];
  for (const p of pages) {
    const r = await owner.req(p, { raw: true });
    check(`GET ${p} → 200`, r.status === 200 && !r.data.includes("Something went wrong") && !r.data.includes("Application error"), r.status);
  }
  const leadsList = await owner.req("/api/leads?pageSize=5&sort=score");
  check("lead list API paginates", leadsList.status === 200 && leadsList.data.items.length === 5 && leadsList.data.total > 50, leadsList.data.total);
  const firstLead = leadsList.data.items[0];
  check("lead detail page renders", (await owner.req(`/leads/${firstLead.id}`, { raw: true })).status === 200);

  section("Role-specific pages");
  check("field sales sees Field App", (await demoField.req("/field", { raw: true })).status === 200);
  check("installer sees installations", (await installer.req("/projects", { raw: true })).status === 200);
  const deny = await demoField.req("/settings?tab=pricing", { raw: true });
  check("field sales only gets profile in settings", deny.status === 200 && !deny.data.includes("Pricing &amp; subsidy"));

  section("Lead capture → qualification → automation");
  const phone = rndPhone();
  const created = await tele.req("/api/leads", {
    method: "POST",
    body: { name: "Smoke Test Customer", phone, city: "Chennai", segment: "RESIDENTIAL", source: "WEBSITE", monthlyBill: 3000, ownsProperty: true, roofAreaSqft: 600, lat: 13.0418, lng: 80.2341 },
  });
  const lead = created.data.lead;
  check("create lead → 201", created.status === 201, created.data);
  check("lead code assigned", /^LD-\d{5}$/.test(lead?.code ?? ""), lead?.code);
  check("basic qualification passes (bill + ownership)", lead?.basicQualified === true && lead?.stage === "QUALIFIED", { q: lead?.basicQualified, s: lead?.stage });
  check("system auto-sized from EB bill (~3.3 kW)", lead?.recommendedKw > 2.5 && lead?.recommendedKw < 4, lead?.recommendedKw);
  check("PM Surya Ghar + TN state subsidy computed (₹1,00,000)", lead?.subsidyAmount === 100000, lead?.subsidyAmount);
  check("auto-assigned to a tele-caller", !!lead?.assignedToId);
  const msgs = await tele.req(`/api/leads/${lead.id}/messages`);
  const keys = (msgs.data ?? []).map((m) => m.templateKey);
  check("WhatsApp welcome sent by automation", keys.includes("welcome"), keys);
  check("WhatsApp instant estimate sent on qualification", keys.includes("proposal_estimate"), keys);
  const est = (msgs.data ?? []).find((m) => m.templateKey === "proposal_estimate");
  check("estimate message has system size & subsidy filled in", !!est && est.body.includes("kW") && est.body.includes("1,00,000") && !est.body.includes("{{"), est?.body?.slice(0, 120));

  const dup = await tele.req("/api/leads", { method: "POST", body: { name: "Same Person", phone: `+91 ${phone}`, source: "FACEBOOK" } });
  check("duplicate phone merges into existing lead", dup.status === 200 && dup.data.duplicate === true && dup.data.lead.id === lead.id, dup.data);

  const low = await tele.req("/api/leads", { method: "POST", body: { name: "Low Bill Tenant", phone: rndPhone(), monthlyBill: 400, ownsProperty: false } });
  check("low bill + tenant → disqualified & cold", low.data.lead?.stage === "DISQUALIFIED" && low.data.lead?.temperature === "COLD", low.data.lead?.stage);
  const bad = await tele.req("/api/leads", { method: "POST", body: { name: "Bad Phone", phone: "12345" } });
  check("invalid phone rejected with 400", bad.status === 400);

  const sq = await tele.req(`/api/leads/${lead.id}`, {
    method: "PATCH",
    body: { siteVisitReady: true, installationTimeline: "IMMEDIATE", paymentMode: "CASH", decisionMakerMet: true },
  });
  check("sales qualification → HOT", sq.status === 200 && sq.data.temperature === "HOT" && sq.data.score >= 70, { t: sq.data.temperature, s: sq.data.score });
  const fin = await tele.req(`/api/leads/${low.data.lead.id}`, { method: "PATCH", body: { objection: "FINANCE" } });
  check("objection captured", fin.status === 200 && fin.data.objection === "FINANCE");
  const notes = await tele.req(`/api/leads/${lead.id}/actions`, { method: "POST", body: { action: "note", kind: "CALL", callOutcome: "CONNECTED", body: "Wants install this month" } });
  check("call logged", notes.status === 200);
  const ownerNotifs = await owner.req("/api/notifications");
  check("managers notified about hot lead", ownerNotifs.data.items.some((n) => n.title.includes("HOT")), ownerNotifs.data.items.slice(0, 3).map((n) => n.title));

  const ai = await tele.req(`/api/leads/${lead.id}/ai-insight`, { method: "POST", body: {} });
  check("AI co-pilot insight returned (AI or rule fallback)", ai.status === 200 && !!ai.data.insight?.nextBestAction && !!ai.data.insight?.whatsappMessage, ai.data);

  section("Site pin, scheduling & Google-synced booking");
  const SITE = { lat: 13.0418, lng: 80.2341 };
  check("telecaller cannot confirm site pin", (await tele.req(`/api/leads/${lead.id}/actions`, { method: "POST", body: { action: "pinSite", ...SITE } })).status === 403);
  const pin = await manager.req(`/api/leads/${lead.id}/actions`, { method: "POST", body: { action: "pinSite", ...SITE } });
  check("manager confirms site pin", pin.status === 200 && pin.data.sitePinned === true);

  // A fresh field salesperson so the test never collides with seeded appointments.
  const fieldEmail = `smoke.field.${Date.now()}@zeedra.demo`;
  const newUser = await owner.req("/api/users", { method: "POST", body: { name: "Smoke Field", email: fieldEmail, phone: rndPhone(), role: "FIELD_SALES", password: PW } });
  check("admin adds a field salesperson", newUser.status === 201, newUser.data);
  const fieldUser = newUser.data;
  const field = await new Client().login(fieldEmail);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const slots = await tele.req(`/api/appointments/slots?userId=${fieldUser.id}&date=${tomorrow}`);
  check("availability slots returned", slots.status === 200 && Array.isArray(slots.data.slots), slots.data);

  const startAt = new Date(Date.now() + 20 * 60_000);
  startAt.setSeconds(0, 0);
  const booked = await tele.req("/api/appointments", { method: "POST", body: { leadId: lead.id, assignedToId: fieldUser.id, type: "SITE_VISIT", startAt: startAt.toISOString(), durationMinutes: 60 } });
  check("site visit booked → 201", booked.status === 201, booked.data);
  const clash = await tele.req("/api/appointments", { method: "POST", body: { leadId: lead.id, assignedToId: fieldUser.id, type: "SITE_VISIT", startAt: new Date(startAt.getTime() + 15 * 60_000).toISOString(), durationMinutes: 60 } });
  check("double-booking the salesperson → 409", clash.status === 409, clash.data);
  const past = await tele.req("/api/appointments", { method: "POST", body: { leadId: lead.id, assignedToId: fieldUser.id, type: "SITE_VISIT", startAt: new Date(Date.now() - 86_400_000).toISOString() } });
  check("booking in the past → 400", past.status === 400);
  const afterBook = await tele.req(`/api/leads/${lead.id}`);
  check("lead moved to visit scheduled & handed to field sales", afterBook.data.stage === "SITE_VISIT_SCHEDULED" && afterBook.data.assignedToId === fieldUser.id, { s: afterBook.data.stage });
  const confirmMsg = (await tele.req(`/api/leads/${lead.id}/messages`)).data.find((m) => m.templateKey === "appointment_confirmation");
  check("WhatsApp visit confirmation sent with date/time & salesperson", !!confirmMsg && confirmMsg.body.includes("Smoke Field") && !confirmMsg.body.includes("{{"), confirmMsg?.body?.slice(0, 100));

  section("Field sales: GPS check-in & validated quotations");
  const now = () => new Date().toISOString();
  const ci = await field.req(`/api/appointments/${booked.data.id}`, { method: "POST", body: { action: "checkIn", capture: { ...near(SITE.lat, SITE.lng, 25), accuracyM: 12, deviceTime: now() } } });
  check("check-in at site → VERIFIED", ci.status === 200 && ci.data.validation.verdict === "VERIFIED", ci.data.validation ?? ci.data);

  const quoteBody = { leadId: lead.id, mode: "FIELD", panelBrand: "Waaree", panelWattage: 550, inverterBrand: "Growatt", discount: 0, loan: { enabled: true, tenureMonths: 84, ratePct: 7, downPaymentPct: 10 } };
  const q1 = await field.req("/api/quotations", { method: "POST", body: { ...quoteBody, capture: { ...near(SITE.lat, SITE.lng, 30), accuracyM: 10, deviceTime: now() } } });
  check("on-site quotation → VERIFIED", q1.status === 201 && q1.data.quotation.geoVerdict === "VERIFIED", q1.data.quotation?.geoVerdict ?? q1.data);
  check("quotation linked to the appointment", q1.data.quotation?.appointmentId === booked.data.id);
  check("server-side pricing: total = subtotal + GST, net = total − subsidy", q1.data.quotation && Math.abs(q1.data.quotation.totalAmount - (q1.data.quotation.subtotal + q1.data.quotation.gstAmount)) < 2 && q1.data.quotation.netCost === q1.data.quotation.totalAmount - q1.data.quotation.subsidyAmount);
  check("loan EMI included", q1.data.quotation?.emi > 0);

  const q2 = await field.req("/api/quotations", { method: "POST", body: { ...quoteBody, capture: { ...near(SITE.lat, SITE.lng, 2500), accuracyM: 10, deviceTime: now() } } });
  check("quote 2.5 km away seconds later → IMPOSSIBLE_TRAVEL (+ OUT_OF_RANGE flag)", q2.data.quotation?.geoVerdict === "IMPOSSIBLE_TRAVEL" && q2.data.validation.flags.includes("OUT_OF_RANGE"), q2.data.validation);
  const q3 = await field.req("/api/quotations", { method: "POST", body: { ...quoteBody, capture: { ...near(SITE.lat, SITE.lng, 2500), accuracyM: 10, deviceTime: new Date(Date.now() - 3600_000).toISOString() } } });
  check("back-dated device clock → CLOCK_TAMPER", q3.data.quotation?.geoVerdict === "CLOCK_TAMPER", q3.data.validation);
  const q4 = await field.req("/api/quotations", { method: "POST", body: { ...quoteBody, capture: null } });
  check("quote without GPS → NO_GPS", q4.data.quotation?.geoVerdict === "NO_GPS", q4.data);
  check("field sales cannot create office (no-GPS) quotations", (await field.req("/api/quotations", { method: "POST", body: { ...quoteBody, mode: "OFFICE" } })).status === 403);
  check("tele-caller cannot create quotations", (await tele.req("/api/quotations", { method: "POST", body: quoteBody })).status === 403);
  const off = await manager.req("/api/quotations", { method: "POST", body: { ...quoteBody, mode: "OFFICE" } });
  check("manager office quotation → OFFICE_CREATED", off.status === 201 && off.data.quotation.geoVerdict === "OFFICE_CREATED");

  const flagged = await manager.req("/api/quotations?flagged=1");
  check("flagged quotations visible to managers", flagged.data.some((q) => q.id === q2.data.quotation?.id));
  const mgrNotifs = await manager.req("/api/notifications");
  check("managers alerted about failed validation", mgrNotifs.data.items.some((n) => n.title.includes("validation")), mgrNotifs.data.items.slice(0, 3).map((n) => n.title));
  const review = await manager.req(`/api/quotations/${q2.data.quotation?.id}`, { method: "POST", body: { action: "review", approve: false, note: "Not at site" } });
  check("manager reviews flagged quotation", review.status === 200 && review.data.reviewNote?.startsWith("Rejected"));
  const track = await manager.req("/api/tracking");
  check("tracking shows field team positions", track.status === 200 && track.data.some((u) => u.id === fieldUser.id && u.last), track.data?.length);
  check("field sales cannot open tracking", (await field.req("/api/tracking")).status === 403);
  const ping = await field.req("/api/tracking", { method: "POST", body: { ...SITE, accuracyM: 15 } });
  check("field heartbeat ping accepted", ping.status === 200);

  section("Proposal sharing, acceptance & installation project");
  const sent = await field.req(`/api/quotations/${q1.data.quotation.id}`, { method: "POST", body: { action: "send" } });
  check("quotation sent", sent.status === 200 && sent.data.quotation.status === "SENT" && !!sent.data.quotation.shareToken);
  const token = sent.data.quotation.shareToken;
  const pub = await anon.req(`/q/${token}`, { raw: true });
  check("customer opens proposal via secure link (no login)", pub.status === 200 && pub.data.includes(q1.data.quotation.number));
  check("guessing a token fails", (await anon.req(`/q/${"x".repeat(24)}`, { raw: true })).status === 404);
  const afterView = await field.req(`/api/quotations/${q1.data.quotation.id}`);
  check("proposal view is tracked", !!afterView.data.viewedAt);
  check("quotation detail page renders", (await field.req(`/quotations/${q1.data.quotation.id}`, { raw: true })).status === 200);
  const accepted = await field.req(`/api/quotations/${q1.data.quotation.id}`, { method: "POST", body: { action: "accept" } });
  check("quotation accepted", accepted.status === 200 && accepted.data.status === "ACCEPTED");
  const won = await owner.req(`/api/leads/${lead.id}`);
  check("lead marked WON with deal value", won.data.stage === "WON" && won.data.dealValue > 0, won.data.stage);
  check("installation project opened", !!won.data.project?.code, won.data.project);
  const proj = await owner.req(`/api/projects/${won.data.project.id}`, { method: "PATCH", body: { stage: "DOCUMENTATION", checklist: { aadhaar: true, ebBill: true }, amountReceived: 50000 } });
  check("project stage, checklist & payment updated", proj.status === 200 && proj.data.stage === "DOCUMENTATION" && proj.data.checklist.aadhaar === true && proj.data.amountReceived === 50000, proj.data);
  check("installer cannot edit someone else's project", (await installer.req(`/api/projects/${won.data.project.id}`, { method: "PATCH", body: { notes: "x" } })).status === 403);

  section("Access control & tenant isolation");
  check("field sales cannot read settings API", (await field.req("/api/settings")).status === 403);
  check("tele-caller cannot manage users", (await tele.req("/api/users", { method: "POST", body: { name: "X", email: "x@y.z", role: "ADMIN", password: "abcdefgh1" } })).status === 403);
  const fieldLeads = await field.req("/api/leads?pageSize=100");
  check("field sales only sees own / visit leads", fieldLeads.data.total < leadsList.data.total, fieldLeads.data.total);
  const someoneElse = leadsList.data.items.find((l) => l.id !== lead.id);
  check("field sales gets 404 on a lead that is not theirs", (await field.req(`/api/leads/${someoneElse.id}`)).status === 404);

  const other = new Client();
  const reg = await other.req("/api/auth/register", { method: "POST", body: { orgName: `Isolation Test ${Date.now()}`, name: "Other Owner", email: `iso${Date.now()}@test.dev`, phone: rndPhone(), password: "Secure1234" } });
  check("self-serve signup creates tenant", reg.status === 200, reg.data);
  check("new tenant gets default templates & automations", (await other.req("/api/templates")).data.length >= 10 && (await other.req("/api/automations")).data.rules.length >= 10);
  check("other tenant cannot read our lead", (await other.req(`/api/leads/${lead.id}`)).status === 404);
  check("other tenant cannot read our quotation", (await other.req(`/api/quotations/${q1.data.quotation.id}`)).status === 404);
  check("other tenant sees zero leads", (await other.req("/api/leads")).data.total === 0);
  check("weak password rejected at signup", (await anon.req("/api/auth/register", { method: "POST", body: { orgName: "Weak", name: "Weak", email: `w${Date.now()}@t.dev`, phone: rndPhone(), password: "short" } })).status === 400);

  section("Public lead capture, integrations & scheduler");
  const settings = await owner.req("/api/settings");
  const apiKey = settings.data.apiKey;
  const viaKey = await anon.req("/api/public/leads", { method: "POST", headers: { "x-api-key": apiKey }, body: { name: "FB Lead Ads", phone: rndPhone(), monthlyBill: 4500, source: "FACEBOOK", campaign: "Smoke" } });
  check("lead via API key → 201 with instant estimate", viaKey.status === 201 && viaKey.data.estimate?.systemKw > 0, viaKey.data);
  check("bad API key → 401", (await anon.req("/api/public/leads", { method: "POST", headers: { "x-api-key": "wrong" }, body: { name: "X Y", phone: rndPhone() } })).status === 401);
  const viaForm = await anon.req("/api/public/leads", { method: "POST", body: { orgSlug: "zeedra-solar", name: "Landing Page Lead", phone: rndPhone(), monthlyBill: 2200, ownsProperty: true } });
  check("landing-page form lead → 201", viaForm.status === 201, viaForm.data);
  check("public landing page renders", (await anon.req("/p/zeedra-solar", { raw: true })).status === 200);

  check("cron without secret → 401", (await anon.req("/api/cron/run", { method: "POST" })).status === 401);
  const cron = await anon.req("/api/cron/run", { method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  check("cron with secret runs scheduled automations", cron.status === 200 && cron.data.ok === true, cron.data);
  const cron2 = await anon.req("/api/cron/run", { method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  check("cron is idempotent (no duplicate reminders)", cron2.status === 200 && cron2.data.reminders === 0 && cron2.data.noResponse === 0, cron2.data);

  const verify = await anon.req(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`, { raw: true });
  check("WhatsApp webhook verification handshake", verify.status === 200 && verify.data === "12345", verify.data);
  check("WhatsApp webhook rejects bad verify token", (await anon.req("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1", { raw: true })).status === 403);

  section("Bulk import / export, templates & automations admin");
  const fd = new FormData();
  fd.append("file", new Blob([`Full Name,Mobile Number,City,EB Bill,Own House\nCSV One,${rndPhone()},Madurai,2800,yes\n"Two, CSV",${rndPhone()},Coimbatore,₹5,000,no\nBroken Row,123,X,1,yes\n`], { type: "text/csv" }), "leads.csv");
  fd.append("source", "INDIAMART");
  const imp = await owner.req("/api/leads/import", { method: "POST", body: fd });
  check("CSV import creates rows and reports errors", imp.status === 200 && imp.data.created === 2 && imp.data.failed === 1, imp.data);
  check("malformed upload → 400 not 500", (await owner.req("/api/leads/import", { method: "POST", body: { not: "a form" } })).status === 400);
  const exp = await owner.req("/api/leads/export?temperature=HOT", { raw: true });
  check("CSV export downloads", exp.status === 200 && exp.headers.get("content-type").includes("text/csv") && exp.data.includes("code,name,phone"));

  const tpl = await owner.req("/api/templates", { method: "POST", body: { key: "smoke_test", name: "Smoke", category: "UTILITY", body: "Hi {{name}}, test", language: "en", active: true } });
  check("template created", tpl.status === 200 && tpl.data.key === "smoke_test", tpl.data);
  const rule = await owner.req("/api/automations", { method: "POST", body: { name: "Smoke rule", trigger: "STAGE_CHANGED", conditions: [{ field: "stage", op: "eq", value: "NEGOTIATION" }], actions: [{ type: "SEND_WHATSAPP", templateKey: "smoke_test" }] } });
  check("automation created", rule.status === 200 && rule.data.active === true, rule.data);
  check("template in use cannot be deleted", (await owner.req(`/api/templates/${tpl.data.id}`, { method: "DELETE" })).status === 409);
  check("automation with unknown template rejected", (await owner.req("/api/automations", { method: "POST", body: { name: "Bad rule", trigger: "LEAD_CREATED", actions: [{ type: "SEND_WHATSAPP", templateKey: "does_not_exist" }] } })).status === 400);
  check("automation deleted", (await owner.req(`/api/automations/${rule.data.id}`, { method: "DELETE" })).status === 200);
  check("template deleted", (await owner.req(`/api/templates/${tpl.data.id}`, { method: "DELETE" })).status === 200);

  const stage = await owner.req(`/api/leads/${low.data.lead.id}/actions`, { method: "POST", body: { action: "stage", stage: "LOST" } });
  check("marking LOST requires a reason", stage.status === 400);
  const brief = await owner.req("/api/dashboard/brief", { method: "POST", body: {} });
  check("daily brief generated", brief.status === 200 && brief.data.brief.length > 20, brief.data);

  section("Session");
  await owner.req("/api/auth/logout", { method: "POST", body: {} });
  check("logout ends the session", (await owner.req("/api/me")).status === 401);

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log(failures.map((f) => `   - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
