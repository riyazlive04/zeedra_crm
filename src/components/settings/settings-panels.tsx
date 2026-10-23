"use client";

import { TimeAgo } from "../time-ago";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2, Copy, RefreshCw, CheckCircle2, XCircle, CalendarDays, MessageCircle, Sparkles, KeyRound, Globe, Clock } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, Field } from "../ui";
import { Modal } from "../modal";
import { NumberInput, Segmented, YesNo } from "../form-controls";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import type { OrgSettings } from "@/lib/settings";
import { ROLE_LABEL } from "@/lib/rbac";
import { ROLES } from "@/lib/validators";
import { PROJECT_STAGES } from "@/lib/defaults";
import { humanize, templateVariables, renderTemplate } from "@/lib/text";

function useSaver() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function save(body: unknown, msg = "Settings saved", url = "/api/settings", method = "PATCH") {
    setBusy(true);
    try {
      await api(url, { method, body });
      toast.success(msg);
      router.refresh();
      return true;
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy };
}

/* ── Company ─────────────────────────────────────────────────────────── */

export function CompanyPanel({ org }: { org: { name: string; phone: string | null; email: string | null; address: string | null; gstin: string | null; logoUrl: string | null } }) {
  const [f, setF] = useState({ ...org, phone: org.phone ?? "", email: org.email ?? "", address: org.address ?? "", gstin: org.gstin ?? "", logoUrl: org.logoUrl ?? "" });
  const { save, busy } = useSaver();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader title="Company profile" subtitle="Shown on proposals and WhatsApp messages" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Company name">
          <input className="input" value={f.name} onChange={set("name")} />
        </Field>
        <Field label="GSTIN">
          <input className="input" value={f.gstin} onChange={set("gstin")} />
        </Field>
        <Field label="Phone">
          <input className="input" value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <input className="input" value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={set("address")} />
        </Field>
        <Field label="Logo URL" hint="PNG/SVG, shown on the proposal header" className="sm:col-span-2">
          <input className="input" value={f.logoUrl} onChange={set("logoUrl")} placeholder="https://…" />
        </Field>
      </div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button variant="primary" loading={busy} onClick={() => save({ org: { name: f.name, phone: f.phone || null, email: f.email || null, address: f.address || null, gstin: f.gstin || null, logoUrl: f.logoUrl || null } })}>
          Save
        </Button>
      </div>
    </Card>
  );
}

/* ── Business rules (pricing / qualification / field / scheduling) ───── */

type NumKey = { [K in keyof OrgSettings]: OrgSettings[K] extends number ? K : never }[keyof OrgSettings];

export function RulesPanel({ settings, section }: { settings: OrgSettings; section: "pricing" | "qualification" | "field" | "schedule" }) {
  const [s, setS] = useState<OrgSettings>(settings);
  const [subsidyClaimType, setSubsidyClaimType] = useState<"house" | "community">("house");
  const { save, busy } = useSaver();
  const num = (k: NumKey, label: string, suffix?: string, hint?: string, prefix?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={s[k] as number} onChange={(v) => setS((x) => ({ ...x, [k]: v ?? 0 }))} suffix={suffix} prefix={prefix} />
    </Field>
  );
  const bomNum = (k: keyof OrgSettings["bomRates"], label: string, suffix?: string) => (
    <Field label={label}>
      <NumberInput value={s.bomRates[k]} onChange={(v) => setS((x) => ({ ...x, bomRates: { ...x.bomRates, [k]: v ?? 0 } }))} prefix="₹" suffix={suffix} />
    </Field>
  );

  return (
    <Card>
      {section === "pricing" && (
        <>
          <CardHeader title="Pricing, tariff & subsidy" subtitle="Drives every estimate, quotation and WhatsApp message" />
          <div className="space-y-6 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              {num("tariffPerUnit", "Avg. tariff", "₹/unit")}
              {num("fixedChargesMonthly", "Fixed charges", "₹/month")}
              {num("exportTariffPerUnit", "Net-meter export rate", "₹/unit")}
              {num("specificYield", "Specific yield", "kWh/kWp/yr", "1,350–1,550 across India")}
              {num("roofSqftPerKw", "Roof needed", "sq.ft/kW")}
              {num("gstRate", "GST (composite)", "%", "5% goods ×70% + 18% services ×30%")}
              {num("tariffEscalationPct", "Tariff escalation", "%/yr")}
              {num("degradationPct", "Panel degradation", "%/yr")}
              {num("quotationValidityDays", "Quotation validity", "days")}
            </div>
            <div>
              <div className="label">Price per kWp (pre-GST) by system size</div>
              <div className="space-y-2">
                {s.priceSlabs.map((slab, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-16 text-slate-500">Up to</span>
                    <div className="w-32">
                      <NumberInput suffix="kW" value={slab.upToKw} onChange={(v) => setS((x) => ({ ...x, priceSlabs: x.priceSlabs.map((p, j) => (j === i ? { ...p, upToKw: v ?? 1 } : p)) }))} />
                    </div>
                    <div className="w-40">
                      <NumberInput prefix="₹" value={slab.ratePerKw} onChange={(v) => setS((x) => ({ ...x, priceSlabs: x.priceSlabs.map((p, j) => (j === i ? { ...p, ratePerKw: v ?? 1 } : p)) }))} />
                    </div>
                    <button onClick={() => setS((x) => ({ ...x, priceSlabs: x.priceSlabs.filter((_, j) => j !== i) }))} disabled={s.priceSlabs.length < 2} className="text-slate-400 hover:text-rose-600 disabled:opacity-30" aria-label="Remove slab">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button size="xs" onClick={() => setS((x) => ({ ...x, priceSlabs: [...x.priceSlabs, { upToKw: 1000, ratePerKw: 40000 }] }))}>
                  <Plus className="h-3 w-3" /> Add slab
                </Button>
              </div>
            </div>
            <div className="grid gap-4 rounded-xl bg-emerald-50/60 p-4 sm:grid-cols-3">
              <Field label="PM Surya Ghar central subsidy" hint="Credited by the Government directly to the customer's bank account" className="sm:col-span-3">
                <YesNo value={s.centralSubsidyEnabled} onChange={(v) => setS((x) => ({ ...x, centralSubsidyEnabled: v ?? true }))} yes="Enabled" no="Disabled" />
              </Field>
              {s.centralSubsidyEnabled && (
                <div className="sm:col-span-3">
                  <div className="label mb-2">Claim type — rates are set once here and applied automatically from the lead/project segment</div>
                  <Segmented
                    value={subsidyClaimType}
                    onChange={(v) => setSubsidyClaimType((v ?? "house") as "house" | "community")}
                    options={[
                      { value: "house", label: "House" },
                      { value: "community", label: "Community" },
                    ]}
                  />
                  {subsidyClaimType === "house" ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-slate-500">Residential rooftop (segment: Residential) — ₹/kW by system-size tier, capped at a max amount</p>
                      {s.subsidyRates.house.tiers.map((tier, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="w-16 text-slate-500">Up to</span>
                          <div className="w-32">
                            <NumberInput
                              suffix="kW"
                              value={tier.uptoKw}
                              onChange={(v) =>
                                setS((x) => ({
                                  ...x,
                                  subsidyRates: { ...x.subsidyRates, house: { ...x.subsidyRates.house, tiers: x.subsidyRates.house.tiers.map((t, j) => (j === i ? { ...t, uptoKw: v ?? 1 } : t)) } },
                                }))
                              }
                            />
                          </div>
                          <div className="w-40">
                            <NumberInput
                              prefix="₹"
                              suffix="/kW"
                              value={tier.ratePerKw}
                              onChange={(v) =>
                                setS((x) => ({
                                  ...x,
                                  subsidyRates: { ...x.subsidyRates, house: { ...x.subsidyRates.house, tiers: x.subsidyRates.house.tiers.map((t, j) => (j === i ? { ...t, ratePerKw: v ?? 0 } : t)) } },
                                }))
                              }
                            />
                          </div>
                          <button
                            onClick={() =>
                              setS((x) => ({ ...x, subsidyRates: { ...x.subsidyRates, house: { ...x.subsidyRates.house, tiers: x.subsidyRates.house.tiers.filter((_, j) => j !== i) } } }))
                            }
                            disabled={s.subsidyRates.house.tiers.length < 2}
                            className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
                            aria-label="Remove tier"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <Button
                        size="xs"
                        onClick={() =>
                          setS((x) => ({ ...x, subsidyRates: { ...x.subsidyRates, house: { ...x.subsidyRates.house, tiers: [...x.subsidyRates.house.tiers, { uptoKw: 10, ratePerKw: 0 }] } } }))
                        }
                      >
                        <Plus className="h-3 w-3" /> Add tier
                      </Button>
                      <div className="w-48">
                        <Field label="Capped at, per house">
                          <NumberInput prefix="₹" value={s.subsidyRates.house.maxAmount} onChange={(v) => setS((x) => ({ ...x, subsidyRates: { ...x.subsidyRates, house: { ...x.subsidyRates.house, maxAmount: v ?? 0 } } }))} />
                        </Field>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <p className="text-xs text-slate-500 sm:col-span-2">Housing society / RWA common facilities, incl. EV charging (segment: Housing society) — flat rate per kW, capped at a max system size</p>
                      <Field label="Rate per kW">
                        <NumberInput prefix="₹" value={s.subsidyRates.community.ratePerKw} onChange={(v) => setS((x) => ({ ...x, subsidyRates: { ...x.subsidyRates, community: { ...x.subsidyRates.community, ratePerKw: v ?? 0 } } }))} />
                      </Field>
                      <Field label="Capped at">
                        <NumberInput suffix="kW" value={s.subsidyRates.community.maxKw} onChange={(v) => setS((x) => ({ ...x, subsidyRates: { ...x.subsidyRates, community: { ...x.subsidyRates.community, maxKw: v ?? 1 } } }))} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
              <div className="sm:col-span-3">
                <div className="label">State top-up subsidy by system size (e.g. Tamil Nadu G.O. 102) — flat amount, not per-kW</div>
                <div className="space-y-2">
                  {s.stateSubsidyTiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-slate-500">Up to</span>
                      <div className="w-32">
                        <NumberInput suffix="kW" value={tier.upToKw} onChange={(v) => setS((x) => ({ ...x, stateSubsidyTiers: x.stateSubsidyTiers.map((t, j) => (j === i ? { ...t, upToKw: v ?? 1 } : t)) }))} />
                      </div>
                      <div className="w-40">
                        <NumberInput prefix="₹" value={tier.amount} onChange={(v) => setS((x) => ({ ...x, stateSubsidyTiers: x.stateSubsidyTiers.map((t, j) => (j === i ? { ...t, amount: v ?? 0 } : t)) }))} />
                      </div>
                      <button onClick={() => setS((x) => ({ ...x, stateSubsidyTiers: x.stateSubsidyTiers.filter((_, j) => j !== i) }))} disabled={s.stateSubsidyTiers.length < 1} className="text-slate-400 hover:text-rose-600 disabled:opacity-30" aria-label="Remove tier">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <Button size="xs" onClick={() => setS((x) => ({ ...x, stateSubsidyTiers: [...x.stateSubsidyTiers, { upToKw: 10, amount: 0 }] }))}>
                    <Plus className="h-3 w-3" /> Add tier
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <div className="label">Installation & balance-of-system rates</div>
              <p className="mb-2 text-xs text-slate-500">Per-kW build costs used to itemise the bill of materials on every proposal. Panels (52%) and inverter (15%) are priced as a share of the system price above; everything below fills the rest, scaled to match.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {bomNum("mountingPerKw", "Mounting structure", "/kW")}
                {bomNum("dcdbPerKw", "DCDB", "/kW")}
                {bomNum("acdbPerKw", "ACDB", "/kW")}
                {bomNum("dcCablePerKw", "DC cable", "/kW")}
                {bomNum("acCablePerKw", "AC copper cable", "/kW")}
                {bomNum("miscPerKw", "Miscellaneous hardware", "/kW")}
                {bomNum("installationPerKw", "Installation & commissioning", "/kW")}
                {bomNum("transportPerKw", "Transport & logistics", "/kW")}
                {bomNum("netMeteringPerKw", "Net-metering & documentation", "/kW")}
                {bomNum("lightningArrestorEach", "Lightning arrestor", "each")}
                {bomNum("earthingKitEach", "Earthing kit", "each")}
              </div>
            </div>
            <div className="grid gap-4 rounded-xl bg-sky-50/60 p-4 sm:grid-cols-3">
              {num("loanRatePct", "Default loan rate", "% p.a.")}
              {num("loanTenureMonths", "Default tenure", "months")}
              {num("loanDownPaymentPct", "Down payment", "%")}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Panel brands (comma separated)" className="sm:col-span-3">
                <input className="input" value={s.panelBrands.join(", ")} onChange={(e) => setS((x) => ({ ...x, panelBrands: e.target.value.split(",").map((b) => b.trim()).filter(Boolean) }))} />
              </Field>
              <Field label="Inverter brands (comma separated)" className="sm:col-span-3">
                <input className="input" value={s.inverterBrands.join(", ")} onChange={(e) => setS((x) => ({ ...x, inverterBrands: e.target.value.split(",").map((b) => b.trim()).filter(Boolean) }))} />
              </Field>
              <Field label="Default panel brand">
                <select className="input" value={s.defaultPanelBrand} onChange={(e) => setS((x) => ({ ...x, defaultPanelBrand: e.target.value }))}>
                  {s.panelBrands.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              {num("defaultPanelWattage", "Default panel wattage", "Wp")}
              <Field label="Default inverter brand">
                <select className="input" value={s.defaultInverterBrand} onChange={(e) => setS((x) => ({ ...x, defaultInverterBrand: e.target.value }))}>
                  {s.inverterBrands.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </>
      )}
      {section === "qualification" && (
        <>
          <CardHeader title="Qualification & scoring" subtitle="Basic qualification thresholds and Hot/Warm/Cold cut-offs" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {num("minMonthlyBillResidential", "Min. monthly bill — residential", "₹")}
            {num("minMonthlyBillCommercial", "Min. monthly bill — commercial/industrial", "₹")}
            <Field label="Require property ownership (residential)">
              <YesNo value={s.requireOwnership} onChange={(v) => setS((x) => ({ ...x, requireOwnership: v ?? true }))} />
            </Field>
            <Field label="Lead routing">
              <select className="input" value={s.autoAssign} onChange={(e) => setS((x) => ({ ...x, autoAssign: e.target.value as OrgSettings["autoAssign"] }))}>
                <option value="ROUND_ROBIN">Round-robin (tele-callers first)</option>
                <option value="LEAST_LOADED">Least open leads</option>
                <option value="NONE">Manual assignment</option>
              </select>
            </Field>
            {num("hotScore", "Hot when score ≥", "/100")}
            {num("warmScore", "Warm when score ≥", "/100")}
            <p className="text-xs text-slate-500 sm:col-span-2">
              Score = timeline (0–30) + site-visit readiness (0–20) + finance readiness (0–20) + bill size (0–15) + decision-maker (8) + recent engagement (0–7) − objection penalty. Failing basic qualification caps the score at 15.
            </p>
          </div>
        </>
      )}
      {section === "field" && (
        <>
          <CardHeader title="GPS & time validation" subtitle="How strictly visits and quotations are verified" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {num("geofenceRadiusM", "Geofence radius around site", "m", "100–300 m works for most urban sites")}
            {num("maxGpsAccuracyM", "Max allowed GPS error", "m")}
            {num("maxClockDriftMin", "Max device-clock drift", "min", "Detects back-dated or manipulated phones")}
            {num("maxTravelSpeedKmph", "Max plausible travel speed", "km/h", "Detects mock-location apps")}
            {num("appointmentWindowBeforeMin", "Slot window — before start", "min")}
            {num("appointmentWindowAfterMin", "Slot window — after end", "min")}
            <Field label="Require a booked appointment for field quotations" className="sm:col-span-2">
              <YesNo value={s.requireAppointmentForQuote} onChange={(v) => setS((x) => ({ ...x, requireAppointmentForQuote: v ?? false }))} />
            </Field>
          </div>
        </>
      )}
      {section === "schedule" && (
        <>
          <CardHeader title="Scheduling" subtitle="Working hours used for appointment slots" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Day starts">
              <input type="time" className="input" value={s.workdayStart} onChange={(e) => setS((x) => ({ ...x, workdayStart: e.target.value }))} />
            </Field>
            <Field label="Day ends">
              <input type="time" className="input" value={s.workdayEnd} onChange={(e) => setS((x) => ({ ...x, workdayEnd: e.target.value }))} />
            </Field>
            {num("slotMinutes", "Slot length", "min")}
            <Field label="Working days" className="sm:col-span-3">
              <div className="flex flex-wrap gap-1.5">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setS((x) => ({ ...x, workdays: x.workdays.includes(i) ? x.workdays.filter((w) => w !== i) : [...x.workdays, i].sort() }))}
                    className={clsx("rounded-lg border px-3 py-1.5 text-xs font-medium", s.workdays.includes(i) ? "border-sun-500 bg-sun-50 text-sun-800" : "border-slate-200 text-slate-500")}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Timezone">
              <input className="input" value={s.timezone} onChange={(e) => setS((x) => ({ ...x, timezone: e.target.value }))} />
            </Field>
          </div>
        </>
      )}
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button variant="primary" loading={busy} onClick={() => save({ settings: s })}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

/* ── Project workflow responsibilities ──────────────────────────────── */

type WorkflowStep = OrgSettings["projectWorkflow"][number];

export function WorkflowPanel({ settings, team }: { settings: OrgSettings; team: { id: string; name: string; role: string }[] }) {
  const [rows, setRows] = useState<WorkflowStep[]>(() =>
    PROJECT_STAGES.map((s) => settings.projectWorkflow.find((w) => w.stage === s.key) ?? { stage: s.key, primaryUserId: null, coordinatorUserId: null, taskTitle: "", dueInDays: 3 }),
  );
  const { save, busy } = useSaver();
  const update = (i: number, patch: Partial<WorkflowStep>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const nameOf = (id: string | null) => (id ? team.find((u) => u.id === id)?.name : null);

  return (
    <Card>
      <CardHeader
        title="Project workflow responsibilities"
        subtitle="When a project reaches a stage, the primary responsible person automatically gets a task. Only Owner/Admin can change this."
      />
      <div className="divide-y divide-slate-100">
        {PROJECT_STAGES.map((s, i) => {
          const row = rows[i];
          return (
            <div key={s.key} className="grid gap-3 p-5 sm:grid-cols-[170px_1fr] sm:items-start">
              <div>
                <div className="text-sm font-semibold text-slate-800">{s.label}</div>
                <div className="text-[11px] text-slate-400">{s.hint}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Primary responsible">
                  <select className="input" value={row.primaryUserId ?? ""} onChange={(e) => update(i, { primaryUserId: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Coordinator (optional)">
                  <select className="input" value={row.coordinatorUserId ?? ""} onChange={(e) => update(i, { coordinatorUserId: e.target.value || null })}>
                    <option value="">None</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Task title" className="lg:col-span-1">
                  <input className="input" value={row.taskTitle} onChange={(e) => update(i, { taskTitle: e.target.value })} placeholder={s.hint} />
                </Field>
                <Field label="Due in (days)">
                  <NumberInput value={row.dueInDays} onChange={(v) => update(i, { dueInDays: v ?? 3 })} />
                </Field>
              </div>
              {(row.primaryUserId || row.coordinatorUserId) && (
                <div className="text-[11px] text-slate-400 sm:col-start-2">
                  {row.primaryUserId && <>Primary: {nameOf(row.primaryUserId)}</>}
                  {row.coordinatorUserId && <> · Coordinating: {nameOf(row.coordinatorUserId)}</>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button variant="primary" loading={busy} onClick={() => save({ settings: { projectWorkflow: rows } }, "Workflow responsibilities saved")}>
          Save workflow
        </Button>
      </div>
    </Card>
  );
}

/* ── Team ────────────────────────────────────────────────────────────── */

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  territory: string | null;
  avatarColor: string;
  googleEmail: string | null;
  lastLoginAt: string | null;
}

export function TeamPanel({ users, me }: { users: TeamUser[]; me: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "FIELD_SALES", territory: "", password: "" });
  const { save, busy } = useSaver();
  return (
    <Card>
      <CardHeader title="Team" subtitle={`${users.filter((u) => u.active).length} active users`} action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add user</Button>} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-5 py-2">User</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Territory</th>
              <th className="px-3 py-2">Google Calendar</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-5 py-2 text-right">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={clsx(!u.active && "opacity-50")}>
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} color={u.avatarColor} size={28} />
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {u.role === "OWNER" || u.id === me ? (
                    <Badge tone="violet">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</Badge>
                  ) : (
                    <select className="input h-8 w-auto py-0 text-xs" defaultValue={u.role} onChange={(e) => save({ role: e.target.value }, "Role updated", `/api/users/${u.id}`)}>
                      {ROLES.filter((r) => r !== "OWNER").map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">{u.territory ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs">{u.googleEmail ? <span className="text-emerald-700">✓ {u.googleEmail}</span> : <span className="text-slate-400">Not connected</span>}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{u.lastLoginAt ? <TimeAgo date={u.lastLoginAt} /> : "Never"}</td>
                <td className="px-5 py-2.5 text-right">
                  {u.role !== "OWNER" && u.id !== me && (
                    <Button size="xs" variant={u.active ? "ghost" : "secondary"} onClick={() => save({ active: !u.active }, u.active ? "User deactivated — open leads returned to pool" : "User re-activated", `/api/users/${u.id}`)}>
                      {u.active ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add team member"
        subtitle="Share the email and temporary password with them — they can change it in their profile."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (await save({ ...f, phone: f.phone || undefined, territory: f.territory || undefined }, "User added", "/api/users", "POST")) {
                  setOpen(false);
                  setF({ name: "", email: "", phone: "", role: "FIELD_SALES", territory: "", password: "" });
                }
              }}
            >
              Add user
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Mobile">
            <input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Role">
            <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.filter((r) => r !== "OWNER").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Territory">
            <input className="input" value={f.territory} onChange={(e) => setF({ ...f, territory: e.target.value })} placeholder="e.g. South Chennai" />
          </Field>
          <Field label="Temporary password" hint="8+ characters">
            <input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/* ── Integrations ────────────────────────────────────────────────────── */

export function IntegrationsPanel({
  appUrl,
  apiKey,
  orgSlug,
  whatsapp,
  ai,
  googleOAuth,
  googleEmail,
  googleStatus,
}: {
  appUrl: string;
  apiKey: string;
  orgSlug: string;
  whatsapp: { phoneNumberId: string | null; businessId: string | null; connected: boolean };
  ai: boolean;
  googleOAuth: boolean;
  googleEmail: string | null;
  googleStatus?: string;
}) {
  const toast = useToast();
  const { save, busy } = useSaver();
  const [wa, setWa] = useState({ phoneNumberId: whatsapp.phoneNumberId ?? "", businessId: whatsapp.businessId ?? "", accessToken: "" });
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  const status = (ok: boolean, on = "Connected", off = "Not connected") => (
    <Badge tone={ok ? "green" : "slate"}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {ok ? on : off}
    </Badge>
  );
  const curl = `curl -X POST ${appUrl}/api/public/leads \\\n  -H "x-api-key: ${apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Ravi Kumar","phone":"9876543210","city":"Chennai","monthlyBill":3200,"ownsProperty":true,"source":"FACEBOOK","campaign":"Diwali"}'`;

  return (
    <div className="space-y-4">
      {googleStatus && (
        <div className={clsx("rounded-xl px-4 py-3 text-sm", googleStatus === "connected" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
          Google Calendar: {humanize(googleStatus)}
        </div>
      )}
      <Card>
        <CardHeader title="WhatsApp Cloud API (Meta)" subtitle="Automated and manual WhatsApp from your business number" icon={<MessageCircle className="h-4 w-4" />} action={status(whatsapp.connected)} />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Phone number ID">
              <input className="input" value={wa.phoneNumberId} onChange={(e) => setWa({ ...wa, phoneNumberId: e.target.value })} />
            </Field>
            <Field label="WhatsApp Business Account ID">
              <input className="input" value={wa.businessId} onChange={(e) => setWa({ ...wa, businessId: e.target.value })} />
            </Field>
            <Field label="Permanent access token" hint={whatsapp.connected ? "Leave blank to keep the saved token" : "System-user token with whatsapp_business_messaging"}>
              <input className="input" type="password" value={wa.accessToken} onChange={(e) => setWa({ ...wa, accessToken: e.target.value })} />
            </Field>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <b>Webhook</b> (Meta → WhatsApp → Configuration): callback URL{" "}
            <code className="rounded bg-white px-1 py-0.5">{appUrl}/api/webhooks/whatsapp</code> · verify token = <code>WHATSAPP_VERIFY_TOKEN</code> from your environment · subscribe to <i>messages</i>. Incoming
            messages from unknown numbers create leads automatically. Without a connection, messages are logged and opened through wa.me click-to-chat.
          </div>
          <div className="flex justify-end">
            <Button variant="primary" loading={busy} onClick={() => save({ whatsapp: { phoneNumberId: wa.phoneNumberId || null, businessId: wa.businessId || null, accessToken: wa.accessToken || undefined } }, "WhatsApp settings saved")}>
              Save WhatsApp
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Google Calendar" subtitle="Each salesperson connects their own calendar from their profile" icon={<CalendarDays className="h-4 w-4" />} action={status(googleOAuth, "OAuth configured", "Not configured")} />
        <div className="space-y-3 p-5 text-sm text-slate-600">
          {googleOAuth ? (
            <>
              <p>Appointments are created on the assigned salesperson&apos;s calendar with the customer invited, and free/busy is used for slot suggestions.</p>
              <ConnectGoogle email={googleEmail} />
            </>
          ) : (
            <p className="text-xs">
              Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (OAuth web client) with redirect URI <code>{appUrl}/api/integrations/google/callback</code>. See docs/INTEGRATIONS.md.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Claude AI" subtitle="Lead coaching, EB-bill reading, reply drafting and daily brief" icon={<Sparkles className="h-4 w-4" />} action={status(ai, "Active", "Rule-based mode")} />
        <p className="p-5 text-xs text-slate-600">{ai ? "AI features are active." : "Set ANTHROPIC_API_KEY on the server to enable AI. Every feature has a rule-based fallback, so the CRM works fully without it."}</p>
      </Card>

      <Card>
        <CardHeader title="Lead capture API & website form" subtitle="Facebook Lead Ads (via Zapier/Make), IndiaMART, JustDial, your website" icon={<KeyRound className="h-4 w-4" />} />
        <div className="space-y-4 p-5">
          <Field label="API key">
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={apiKey} />
              <Button onClick={() => copy(apiKey)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button onClick={() => confirm("Rotate the API key? Existing integrations will stop until updated.") && save({ rotateApiKey: true }, "API key rotated")}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <div>
            <div className="label">Example request</div>
            <pre className="overflow-x-auto rounded-lg bg-ink-950 p-3 text-[11px] leading-relaxed text-slate-200">{curl}</pre>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sun-50 p-3 text-xs text-slate-700">
            <Globe className="h-4 w-4 text-sun-600" /> Hosted landing page with instant solar estimate:
            <a href={`/p/${orgSlug}`} target="_blank" rel="noreferrer" className="font-mono font-medium text-sun-700 hover:underline">
              {appUrl}/p/{orgSlug}
            </a>
            <Button size="xs" onClick={() => copy(`${appUrl}/p/${orgSlug}`)}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Scheduled automations (reminders, re-engagement, quote expiry) run when your scheduler calls <code>POST {appUrl}/api/cron/run</code> with <code>Authorization: Bearer $CRON_SECRET</code> every 5–15 minutes.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ConnectGoogle({ email }: { email: string | null }) {
  const { save, busy } = useSaver();
  return email ? (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone="green">
        <CheckCircle2 className="h-3 w-3" /> Your calendar: {email}
      </Badge>
      <Button size="sm" loading={busy} onClick={() => save(undefined, "Google Calendar disconnected", "/api/integrations/google", "DELETE")}>
        Disconnect
      </Button>
    </div>
  ) : (
    <a href="/api/integrations/google" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium shadow-sm hover:bg-slate-50">
      <CalendarDays className="h-4 w-4 text-sky-600" /> Connect my Google Calendar
    </a>
  );
}

/* ── Templates ───────────────────────────────────────────────────────── */

export interface Template {
  id: string;
  key: string;
  name: string;
  category: string;
  metaTemplateName: string | null;
  language: string;
  body: string;
  active: boolean;
}

const SAMPLE = { name: "Ravi", fullName: "Ravi Kumar", company: "Your Solar Co.", bill: "₹3,200", units: 385, kw: 3.3, panels: 6, panelWattage: 550, cost: "₹2,08,000", subsidy: "₹78,000", netCost: "₹1,30,000", savings: "₹3,100", annualSavings: "₹37,200", payback: 3.5, emi: "₹1,780", loanTenure: 7, salesperson: "Arun", salespersonPhone: "+91 98400 55501", date: "Sat, 25 Oct", time: "11:00 AM", quoteNumber: "QT-2026-00042", validUntil: "6 Nov 2026", quoteLink: "https://app/q/…", leadCode: "LD-00042", city: "Chennai" };

export function TemplatesPanel({ templates }: { templates: Template[] }) {
  const [edit, setEdit] = useState<Template | "new" | null>(null);
  return (
    <Card>
      <CardHeader title="WhatsApp templates" subtitle="Use {{variables}} — filled from the lead, sizing and appointment" action={<Button size="sm" variant="primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New template</Button>} />
      <ul className="divide-y divide-slate-100">
        {templates.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-5 py-3">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t.name}</span>
                <code className="text-[11px] text-slate-400">{t.key}</code>
                <Badge tone={t.category === "MARKETING" ? "violet" : "blue"}>{humanize(t.category)}</Badge>
                {t.metaTemplateName ? <Badge tone="green">Meta: {t.metaTemplateName}</Badge> : <Badge tone="slate">Session message</Badge>}
                {!t.active && <Badge tone="rose">Inactive</Badge>}
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">{t.body}</p>
            </div>
            <Button size="xs" onClick={() => setEdit(t)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
      {edit && <TemplateEditor t={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function TemplateEditor({ t, onClose }: { t: Template | null; onClose: () => void }) {
  const [f, setF] = useState({ key: t?.key ?? "", name: t?.name ?? "", category: t?.category ?? "UTILITY", metaTemplateName: t?.metaTemplateName ?? "", language: t?.language ?? "en", body: t?.body ?? "Hi {{name}}, ", active: t?.active ?? true });
  const { save, busy } = useSaver();
  const vars = templateVariables(f.body);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t ? `Edit · ${t.name}` : "New template"}
      footer={
        <>
          {t && (
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={async () => (await save(undefined, "Template deleted", `/api/templates/${t.id}`, "DELETE")) && onClose()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              const body = { name: f.name, category: f.category, metaTemplateName: f.metaTemplateName || null, language: f.language, body: f.body, active: f.active };
              const ok = t ? await save(body, "Template saved", `/api/templates/${t.id}`) : await save({ ...body, key: f.key }, "Template created", "/api/templates", "POST");
              if (ok) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Key">
              <input className="input font-mono text-xs" disabled={!!t} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            </Field>
            <Field label="Category">
              <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </Field>
            <Field label="Language">
              <select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
                {[["en", "English"], ["ta", "Tamil"], ["hi", "Hindi"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"], ["mr", "Marathi"], ["gu", "Gujarati"], ["bn", "Bengali"]].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Approved Meta template name" hint="Required to message customers outside the 24-hour window. Variables are sent in the order they appear.">
            <input className="input" value={f.metaTemplateName} onChange={(e) => setF({ ...f, metaTemplateName: e.target.value })} />
          </Field>
          <Field label="Message">
            <textarea className="input min-h-[180px] font-mono text-xs" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-1">
            {Object.keys(SAMPLE).map((v) => (
              <button key={v} type="button" onClick={() => setF({ ...f, body: `${f.body}{{${v}}}` })} className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 hover:border-sun-400">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="accent-amber-500" /> Active
          </label>
        </div>
        <div>
          <div className="label">Preview</div>
          <div className="rounded-xl p-4" style={{ backgroundColor: "#efeae2" }}>
            <div className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] shadow-sm">{renderTemplate(f.body, SAMPLE)}</div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Variables used: {vars.length ? vars.join(", ") : "none"}</p>
        </div>
      </div>
    </Modal>
  );
}

/* ── Profile ─────────────────────────────────────────────────────────── */

export function ProfilePanel({ user, googleOAuth }: { user: { id: string; name: string; email: string; phone: string | null; googleEmail: string | null }; googleOAuth: boolean }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const { save, busy } = useSaver();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="My profile" subtitle={user.email} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Mobile" hint="Shown to customers in WhatsApp messages">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <Button variant="primary" loading={busy} onClick={() => save({ name, phone: phone || null }, "Profile saved", `/api/users/${user.id}`)}>
            Save profile
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Google Calendar" subtitle="Your appointments sync to your calendar with reminders" icon={<CalendarDays className="h-4 w-4" />} />
        <div className="p-5">{googleOAuth ? <ConnectGoogle email={user.googleEmail} /> : <p className="text-xs text-slate-500">Your administrator has not configured Google OAuth yet.</p>}</div>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Current password">
            <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="8+ characters">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <Button
            variant="primary"
            loading={busy}
            disabled={pw.length < 8}
            onClick={async () => {
              if (await save({ password: pw, currentPassword: cur }, "Password changed", `/api/users/${user.id}`)) {
                setPw("");
                setCur("");
              }
            }}
          >
            Update password
          </Button>
        </div>
      </Card>
    </div>
  );
}
