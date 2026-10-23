"use client";

import { TimeAgo } from "../time-ago";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import clsx from "clsx";
import {
  Phone, MessageCircle, CalendarPlus, FileText, Sparkles, Copy, Send, StickyNote, PhoneCall, MapPin, ShieldCheck, Clock3,
  Bot, ArrowRightLeft, Trophy, XCircle, CheckCircle2, AlertTriangle, Landmark, ClipboardCheck, Hammer, ChevronRight, Info,
} from "lucide-react";
import { Avatar, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Field, ProgressBar } from "../ui";
import { StageBadge, TemperatureBadge, VerdictBadge, STAGE_LABEL } from "../badges";
import { NumberInput, Segmented, YesNo } from "../form-controls";
import { BillReader } from "../bill-reader";
import { SolarEstimate } from "../solar-estimate";
import { BookAppointmentModal } from "../appointments/book-modal";
import { WhatsAppThread, type WaMessage } from "../whatsapp/thread";
import { Map } from "../map/map";
import { Modal } from "../modal";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import { sizeSystem, type SegmentKey } from "@/lib/solar/sizing";
import { loanOptions } from "@/lib/solar/finance";
import type { OrgSettings } from "@/lib/settings";
import { displayPhone, formatINR, humanize } from "@/lib/text";
import { LOAN_STATUSES, OBJECTIONS, PAYMENT_MODES, ROOF_TYPES, SEGMENTS, STAGES, TIMELINES } from "@/lib/validators";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Lead = Record<string, any> & {
  id: string;
  code: string;
  name: string;
  phone: string;
  stage: string;
  temperature: string;
  score: number;
  segment: SegmentKey;
};

interface Props {
  lead: Lead;
  settings: OrgSettings;
  users: { id: string; name: string; role: string }[];
  templates: { key: string; name: string }[];
  activities: { id: string; type: string; title: string; body: string | null; createdAt: Date; user: { name: string } | null }[];
  messages: WaMessage[];
  perms: { assign: boolean; reviewQuotes: boolean; createQuote: boolean; whatsapp: boolean; edit: boolean };
  me: string;
}

const ACT_ICON: Record<string, React.ReactNode> = {
  NOTE: <StickyNote className="h-3.5 w-3.5" />,
  CALL: <PhoneCall className="h-3.5 w-3.5" />,
  WHATSAPP: <MessageCircle className="h-3.5 w-3.5" />,
  APPOINTMENT: <CalendarPlus className="h-3.5 w-3.5" />,
  CHECK_IN: <MapPin className="h-3.5 w-3.5" />,
  QUOTATION: <FileText className="h-3.5 w-3.5" />,
  AI: <Sparkles className="h-3.5 w-3.5" />,
  AUTOMATION: <Bot className="h-3.5 w-3.5" />,
  STAGE_CHANGE: <ArrowRightLeft className="h-3.5 w-3.5" />,
  QUALIFICATION: <ClipboardCheck className="h-3.5 w-3.5" />,
  ASSIGNMENT: <ArrowRightLeft className="h-3.5 w-3.5" />,
  SYSTEM: <Info className="h-3.5 w-3.5" />,
};

export function LeadWorkspace({ lead, settings, users, templates, activities, messages, perms, me }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"qualify" | "proposal" | "whatsapp" | "timeline" | "visits">("qualify");
  const [bookOpen, setBookOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState<null | "WON" | "LOST" | "OTHER">(null);
  const [callOpen, setCallOpen] = useState(false);

  const breakdown = (lead.scoreBreakdown as { breakdown?: { key: string; label: string; points: number }[]; nextActions?: string[]; missing?: string[] } | null) ?? {};
  const fieldUsers = users.filter((u) => u.role !== "INSTALLER");
  const quoteHref = perms.reviewQuotes ? `/quotations/new?leadId=${lead.id}` : `/field/quote/${lead.id}`;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{lead.code}</span>
              <StageBadge value={lead.stage} />
              <TemperatureBadge value={lead.temperature} score={lead.score} />
              {lead.basicQualified === true && <Badge tone="green">✓ Basic qualified</Badge>}
              {lead.basicQualified === false && <Badge tone="rose">✗ Not qualified</Badge>}
              <Badge tone="slate">{humanize(lead.segment)}</Badge>
              <Badge tone="slate">{humanize(lead.source)}</Badge>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">{lead.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <a href={`tel:+${lead.phone}`} className="inline-flex items-center gap-1.5 hover:text-sun-700">
                <Phone className="h-3.5 w-3.5" /> {displayPhone(lead.phone)}
              </a>
              {lead.email && <span>{lead.email}</span>}
              {(lead.address || lead.city) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {[lead.address, lead.city, lead.pincode].filter(Boolean).join(", ")}
                </span>
              )}
              <span>
                Created <TimeAgo date={lead.createdAt} />
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:+${lead.phone}`} onClick={() => setTimeout(() => setCallOpen(true), 400)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium shadow-sm hover:bg-slate-50">
              <Phone className="h-4 w-4 text-emerald-600" /> Call
            </a>
            <Button onClick={() => setCallOpen(true)}>
              <StickyNote className="h-4 w-4" /> Log
            </Button>
            {perms.edit && (
              <Button onClick={() => setBookOpen(true)}>
                <CalendarPlus className="h-4 w-4 text-sky-600" /> Book visit
              </Button>
            )}
            {perms.createQuote && (
              <ButtonLink href={quoteHref} variant="primary">
                <FileText className="h-4 w-4" /> Quotation
              </ButtonLink>
            )}
            {perms.edit && !["WON", "LOST"].includes(lead.stage) && (
              <>
                <Button onClick={() => setStageOpen("WON")} className="text-emerald-700">
                  <Trophy className="h-4 w-4" /> Won
                </Button>
                <Button onClick={() => setStageOpen("LOST")} className="text-rose-700">
                  <XCircle className="h-4 w-4" /> Lost
                </Button>
              </>
            )}
            {perms.edit && (
              <Button variant="ghost" onClick={() => setStageOpen("OTHER")}>
                Stage <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <StageTrack stage={lead.stage} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* ── Main ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card">
            {(
              [
                ["qualify", "Qualification"],
                ["proposal", "Solar proposal"],
                ["whatsapp", "WhatsApp"],
                ["timeline", "Timeline"],
                ["visits", `Visits & quotes (${(lead.appointments?.length ?? 0) + (lead.quotations?.length ?? 0)})`],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={clsx("whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition", tab === k ? "bg-ink-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === "qualify" && <QualificationForm lead={lead} settings={settings} canEdit={perms.edit} onSaved={() => router.refresh()} />}
          {tab === "proposal" && <ProposalTab lead={lead} settings={settings} quoteHref={quoteHref} canQuote={perms.createQuote} />}
          {tab === "whatsapp" && (
            <Card className="p-4">
              {!lead.whatsappOptIn && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Customer has opted out of WhatsApp automation. Manual messages only.</p>}
              <WhatsAppThread leadId={lead.id} initial={messages} templates={templates} canSend={perms.whatsapp} height={520} />
            </Card>
          )}
          {tab === "timeline" && <Timeline leadId={lead.id} activities={activities} onAdded={() => router.refresh()} />}
          {tab === "visits" && <VisitsAndQuotes lead={lead} onBook={() => setBookOpen(true)} quoteHref={quoteHref} canQuote={perms.createQuote} />}
        </div>

        {/* ── Side ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <AiCopilot lead={lead} canSend={perms.whatsapp} />

          <Card>
            <CardHeader title="Lead score" subtitle="Explainable — every point has a reason" action={<span className="font-display text-xl font-bold text-slate-900">{lead.score}</span>} />
            <div className="space-y-3 px-5 py-4">
              <ProgressBar value={lead.score} tone={lead.temperature === "HOT" ? "red" : lead.temperature === "WARM" ? "sun" : "green"} />
              <ul className="space-y-1.5">
                {(breakdown.breakdown ?? []).map((b) => (
                  <li key={b.key + b.label} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600">{b.label}</span>
                    <span className={clsx("font-semibold tabular-nums", b.points > 0 ? "text-emerald-700" : b.points < 0 ? "text-rose-700" : "text-slate-400")}>
                      {b.points > 0 ? "+" : ""}
                      {b.points}
                    </span>
                  </li>
                ))}
              </ul>
              {!!breakdown.missing?.length && (
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                  <span className="font-medium">Still needed:</span> {breakdown.missing.join(", ")}
                </div>
              )}
              {!!breakdown.nextActions?.length && (
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended next steps</div>
                  <ol className="space-y-1.5">
                    {breakdown.nextActions.map((a, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-700">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sun-100 text-[10px] font-bold text-sun-700">{i + 1}</span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </Card>

          <OwnerCard lead={lead} users={fieldUsers} canAssign={perms.assign} />
          <SiteCard lead={lead} canPin={perms.reviewQuotes} geofence={settings.geofenceRadiusM} />

          {lead.project && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Hammer className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Installation {lead.project.code}</div>
                  <div className="text-xs text-slate-500">{humanize(lead.project.stage)}</div>
                </div>
                <ButtonLink href={`/projects?open=${lead.project.id}`} size="sm">
                  Open
                </ButtonLink>
              </div>
            </Card>
          )}
        </div>
      </div>

      <BookAppointmentModal open={bookOpen} onClose={() => setBookOpen(false)} lead={lead} users={fieldUsers} defaultUserId={users.find((u) => u.id === me && u.role === "FIELD_SALES")?.id ?? lead.assignedToId} />
      <StageModal lead={lead} mode={stageOpen} onClose={() => setStageOpen(null)} />
      <CallLogModal open={callOpen} onClose={() => setCallOpen(false)} leadId={lead.id} />
    </div>
  );
}

function StageTrack({ stage }: { stage: string }) {
  const steps = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON"];
  const idx = steps.indexOf(stage);
  if (stage === "LOST" || stage === "DISQUALIFIED") return null;
  return (
    <div className="mt-5 flex gap-1">
      {steps.map((s, i) => (
        <div key={s} className="min-w-0 flex-1">
          <div className={clsx("h-1.5 rounded-full", i <= idx ? (stage === "WON" ? "bg-emerald-500" : "sun-gradient") : "bg-slate-100")} />
          <div className={clsx("mt-1.5 hidden truncate text-[10px] font-medium md:block", i <= idx ? "text-slate-700" : "text-slate-400")}>{STAGE_LABEL[s]}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Qualification ──────────────────────────────────────────────────────── */

function QualificationForm({ lead, settings, canEdit, onSaved }: { lead: Lead; settings: OrgSettings; canEdit: boolean; onSaved: () => void }) {
  const toast = useToast();
  const pick = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, lead[k] ?? null]));
  const [f, setF] = useState<Record<string, any>>(
    pick([
      "segment", "monthlyBill", "monthlyUnits", "discom", "consumerNumber", "sanctionedLoadKw", "phase", "ownsProperty", "roofType", "roofAreaSqft", "shadowFree", "floors",
      "siteVisitReady", "installationTimeline", "paymentMode", "budgetConfirmed", "loanInterest", "loanStatus", "objection", "objectionNote", "decisionMakerMet", "competitorQuote", "whatsappOptIn",
    ]),
  );
  const [follow, setFollow] = useState<string>(lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "yyyy-MM-dd'T'HH:mm") : "");
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: unknown) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ temperature: string; score: number; stage: string }>(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: { ...f, nextFollowUpAt: follow ? new Date(follow).toISOString() : null },
      });
      toast.success("Qualification saved", `Score ${r.score} · ${humanize(r.temperature)} · ${STAGE_LABEL[r.stage]}`);
      onSaved();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const needsFinance = f.paymentMode === "LOAN" || f.paymentMode === "PARTIAL_LOAN" || f.objection === "FINANCE";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Stage 1 · Basic qualification"
          subtitle="Does the electricity bill justify solar, and does the customer own the roof?"
          icon={<ClipboardCheck className="h-4 w-4" />}
          action={canEdit && <BillReader compact onExtract={(b) => setF((x) => ({ ...x, monthlyBill: b.monthlyBill ?? x.monthlyBill, monthlyUnits: b.monthlyUnits ?? x.monthlyUnits, discom: b.discom ?? x.discom, consumerNumber: b.consumerNumber ?? x.consumerNumber, sanctionedLoadKw: b.sanctionedLoadKw ?? x.sanctionedLoadKw, phase: b.phase ?? x.phase }))} />}
        />
        <fieldset disabled={!canEdit} className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Segment" className="sm:col-span-3">
            <Segmented value={f.segment} onChange={set("segment")} options={SEGMENTS.map((s) => ({ value: s, label: humanize(s) }))} />
          </Field>
          <Field label="Monthly EB bill">
            <NumberInput prefix="₹" value={f.monthlyBill} onChange={set("monthlyBill")} />
          </Field>
          <Field label="Monthly units">
            <NumberInput suffix="kWh" value={f.monthlyUnits} onChange={set("monthlyUnits")} />
          </Field>
          <Field label="Sanctioned load">
            <NumberInput suffix="kW" value={f.sanctionedLoadKw} onChange={set("sanctionedLoadKw")} />
          </Field>
          <Field label="DISCOM">
            <input className="input" value={f.discom ?? ""} onChange={(e) => set("discom")(e.target.value)} />
          </Field>
          <Field label="Consumer no.">
            <input className="input" value={f.consumerNumber ?? ""} onChange={(e) => set("consumerNumber")(e.target.value)} />
          </Field>
          <Field label="Connection">
            <Segmented value={f.phase} onChange={set("phase")} options={[{ value: "SINGLE", label: "1-phase" }, { value: "THREE", label: "3-phase" }]} />
          </Field>
          <Field label="Owns property?">
            <YesNo value={f.ownsProperty} onChange={set("ownsProperty")} />
          </Field>
          <Field label="Shadow-free roof?">
            <YesNo value={f.shadowFree} onChange={set("shadowFree")} />
          </Field>
          <Field label="Roof area">
            <NumberInput suffix="sq.ft" value={f.roofAreaSqft} onChange={set("roofAreaSqft")} />
          </Field>
          <Field label="Roof type" className="sm:col-span-3">
            <Segmented value={f.roofType} onChange={set("roofType")} options={ROOF_TYPES.map((r) => ({ value: r, label: r === "RCC" ? "RCC" : humanize(r) }))} />
          </Field>
        </fieldset>
        {lead.basicCheckReason && (
          <div className={clsx("mx-5 mb-5 flex gap-2 rounded-lg px-3 py-2 text-xs", lead.basicQualified === false ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {lead.basicCheckReason}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Stage 2 · Sales qualification" subtitle="Readiness for site visit and installation, finance, objections" icon={<Trophy className="h-4 w-4" />} />
        <fieldset disabled={!canEdit} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Ready for a site visit?">
            <YesNo value={f.siteVisitReady} onChange={set("siteVisitReady")} />
          </Field>
          <Field label="Decision-maker engaged?">
            <YesNo value={f.decisionMakerMet} onChange={set("decisionMakerMet")} />
          </Field>
          <Field label="Installation timeline" className="sm:col-span-2">
            <Segmented value={f.installationTimeline} onChange={set("installationTimeline")} options={TIMELINES.map((t) => ({ value: t, label: humanize(t) }))} />
          </Field>
          <Field label="Payment mode" className="sm:col-span-2">
            <Segmented value={f.paymentMode} onChange={set("paymentMode")} options={PAYMENT_MODES.map((t) => ({ value: t, label: t === "PARTIAL_LOAN" ? "Part loan" : humanize(t) }))} />
          </Field>
          {needsFinance && (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 sm:col-span-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-800">
                <Landmark className="h-4 w-4" /> Finance can be managed — track the solar loan
              </div>
              <Field label="Loan status">
                <Segmented value={f.loanStatus} onChange={set("loanStatus")} options={LOAN_STATUSES.map((t) => ({ value: t, label: humanize(t) }))} />
              </Field>
              <p className="text-[11px] text-sky-800/80">Documents: Aadhaar, PAN, last 6 months bank statement, latest EB bill, property proof. PM Surya Ghar loans are collateral-free up to 3 kW.</p>
            </div>
          )}
          <Field label="Budget confirmed?">
            <YesNo value={f.budgetConfirmed} onChange={set("budgetConfirmed")} />
          </Field>
          <Field label="Competitor quote">
            <NumberInput prefix="₹" value={f.competitorQuote} onChange={set("competitorQuote")} />
          </Field>
          <Field label="If not ready — what's the problem?" className="sm:col-span-2">
            <Segmented value={f.objection} onChange={set("objection")} options={OBJECTIONS.map((t) => ({ value: t, label: t === "NONE" ? "No objection" : humanize(t) }))} />
          </Field>
          <Field label="Objection details" className="sm:col-span-2">
            <textarea className="input min-h-[64px]" value={f.objectionNote ?? ""} onChange={(e) => set("objectionNote")(e.target.value)} placeholder="In the customer's words…" />
          </Field>
          <Field label="Next follow-up">
            <input type="datetime-local" className="input" value={follow} onChange={(e) => setFollow(e.target.value)} />
          </Field>
          <Field label="WhatsApp automation">
            <YesNo value={f.whatsappOptIn} onChange={(v) => set("whatsappOptIn")(v ?? true)} yes="Opted in" no="Opted out" />
          </Field>
        </fieldset>
      </Card>
      {canEdit && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button variant="primary" size="lg" onClick={save} loading={saving} className="shadow-pop">
            <CheckCircle2 className="h-4 w-4" /> Save & re-score
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-400">Using {settings.minMonthlyBillResidential.toLocaleString("en-IN")} ₹ minimum residential bill · Hot ≥ {settings.hotScore} · Warm ≥ {settings.warmScore}. Change in Settings → Qualification.</p>
    </div>
  );
}

/* ── Proposal ───────────────────────────────────────────────────────────── */

function ProposalTab({ lead, settings, quoteHref, canQuote }: { lead: Lead; settings: OrgSettings; quoteHref: string; canQuote: boolean }) {
  const [override, setOverride] = useState<number | null>(null);
  const r = useMemo(
    () =>
      lead.monthlyBill || lead.monthlyUnits || override
        ? sizeSystem({ monthlyBill: lead.monthlyBill, monthlyUnits: lead.monthlyUnits, segment: lead.segment, roofAreaSqft: override ? null : lead.roofAreaSqft, sanctionedLoadKw: lead.sanctionedLoadKw, phase: lead.phase, overrideKw: override }, settings)
        : null,
    [lead, settings, override],
  );
  if (!r) return <Card><EmptyState icon={<Info className="h-5 w-5" />} title="No energy data yet" body="Add the monthly bill or units in Qualification to generate a proposal." /></Card>;
  const options = loanOptions(r.netCost, r.monthlySavings, settings.loanRatePct, settings.loanDownPaymentPct);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Proposal based on {lead.monthlyUnits ? `${lead.monthlyUnits} units/month` : `${formatINR(lead.monthlyBill)}/month bill`}</h3>
            <p className="text-xs text-slate-500">Required {r.requiredKw} kW for 100% offset · sized to standard panels</p>
          </div>
          <div className="flex items-end gap-2">
            <Field label="Try another size">
              <NumberInput suffix="kW" value={override} onChange={setOverride} placeholder={String(r.recommendedKw)} />
            </Field>
            {canQuote && (
              <ButtonLink href={quoteHref} variant="primary">
                Create quotation
              </ButtonLink>
            )}
          </div>
        </div>
        <SolarEstimate r={r} />
      </Card>
      <Card>
        <CardHeader title="Finance options" subtitle={`Solar loan at ${settings.loanRatePct}% with ${settings.loanDownPaymentPct}% down payment`} icon={<Landmark className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-2">Tenure</th>
                <th className="px-3 py-2 text-right">Down payment</th>
                <th className="px-3 py-2 text-right">EMI</th>
                <th className="px-3 py-2 text-right">Monthly savings</th>
                <th className="px-5 py-2 text-right">Cash-flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {options.map((o) => (
                <tr key={o.tenureMonths}>
                  <td className="px-5 py-2.5 font-medium">{o.tenureMonths / 12} years</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(o.downPayment)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatINR(o.emi)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.monthlySavings)}</td>
                  <td className={clsx("px-5 py-2.5 text-right font-medium tabular-nums", o.monthlyCashflow >= 0 ? "text-emerald-700" : "text-amber-700")}>
                    {o.monthlyCashflow >= 0 ? "+" : "−"}
                    {formatINR(Math.abs(o.monthlyCashflow))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-slate-500">Positive cash-flow means the customer saves more on electricity than the EMI — the strongest closing argument.</p>
      </Card>
    </div>
  );
}

/* ── AI Co-pilot ────────────────────────────────────────────────────────── */

function AiCopilot({ lead, canSend }: { lead: Lead; canSend: boolean }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [insight, setInsight] = useState<null | { summary: string; temperatureRationale: string; nextBestAction: string; objectionHandling: string; whatsappMessage: string; riskFlags: string[] }>(null);
  const [source, setSource] = useState("");

  async function run() {
    setLoading(true);
    try {
      const r = await api<{ insight: NonNullable<typeof insight>; source: string }>(`/api/leads/${lead.id}/ai-insight`, { body: {} });
      setInsight(r.insight);
      setSource(r.source);
    } catch (e) {
      toast.error("AI co-pilot unavailable", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function sendMsg() {
    if (!insight) return;
    setSending(true);
    try {
      const r = await api<{ status: string; waLink: string; error?: string }>("/api/whatsapp", { body: { action: "send", leadId: lead.id, body: insight.whatsappMessage } });
      if (r.status === "SIMULATED") window.open(r.waLink, "_blank");
      else if (r.status === "FAILED") throw new Error(r.error);
      toast.success("Message sent");
    } catch (e) {
      toast.error("Send failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white shadow-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">AI sales co-pilot</div>
            <div className="text-[11px] text-slate-500">{lead.aiUpdatedAt ? <>Updated <TimeAgo date={lead.aiUpdatedAt} /></> : "Coaching for this lead"}</div>
          </div>
        </div>
        <Button size="sm" onClick={run} loading={loading} className="border-violet-200 text-violet-700">
          {insight ? "Refresh" : "Analyse"}
        </Button>
      </div>
      <div className="space-y-3 px-4 pb-4 text-[13px]">
        {!insight && lead.aiNextAction && (
          <div className="rounded-lg bg-white p-3 ring-1 ring-violet-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Next best action</div>
            <p className="mt-1 text-slate-700">{lead.aiNextAction}</p>
          </div>
        )}
        {!insight && !lead.aiNextAction && <p className="text-xs text-slate-500">Get a summary, the next best action, an objection talk-track and a ready-to-send WhatsApp message.</p>}
        {insight && (
          <>
            <p className="text-slate-700">{insight.summary}</p>
            <div className="rounded-lg bg-white p-3 ring-1 ring-violet-100">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Next best action</div>
              <p className="mt-1 font-medium text-slate-800">{insight.nextBestAction}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Why {humanize(lead.temperature).toLowerCase()}</div>
              <p className="mt-0.5 text-xs text-slate-600">{insight.temperatureRationale}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Objection talk-track</div>
              <p className="mt-0.5 text-xs text-slate-600">{insight.objectionHandling}</p>
            </div>
            {insight.riskFlags.length > 0 && (
              <ul className="space-y-1">
                {insight.riskFlags.map((r) => (
                  <li key={r} className="flex gap-1.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg bg-[#d9fdd3] p-3 text-xs text-slate-800">
              <div className="mb-1 text-[10px] font-semibold uppercase text-emerald-800">Suggested WhatsApp</div>
              <p className="whitespace-pre-wrap">{insight.whatsappMessage}</p>
              <div className="mt-2 flex gap-2">
                <Button size="xs" onClick={() => navigator.clipboard.writeText(insight.whatsappMessage).then(() => toast.success("Copied"))}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
                {canSend && (
                  <Button size="xs" variant="dark" onClick={sendMsg} loading={sending}>
                    <Send className="h-3 w-3" /> Send
                  </Button>
                )}
              </div>
            </div>
            {source === "rules" && <p className="text-[11px] text-slate-400">Rule-based insight · connect Claude AI for deeper coaching</p>}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Owner / site ───────────────────────────────────────────────────────── */

function OwnerCard({ lead, users, canAssign }: { lead: Lead; users: { id: string; name: string; role: string }[]; canAssign: boolean }) {
  const router = useRouter();
  const toast = useToast();
  async function assign(userId: string) {
    try {
      await api(`/api/leads/${lead.id}/actions`, { body: { action: "assign", userId: userId || null } });
      toast.success("Lead reassigned");
      router.refresh();
    } catch (e) {
      toast.error("Could not reassign", e instanceof Error ? e.message : undefined);
    }
  }
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Owner</div>
      {canAssign ? (
        <select className="input" value={lead.assignedToId ?? ""} onChange={(e) => assign(e.target.value)}>
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {humanize(u.role)}
            </option>
          ))}
        </select>
      ) : lead.assignedTo ? (
        <div className="flex items-center gap-2">
          <Avatar name={lead.assignedTo.name} color={lead.assignedTo.avatarColor} />
          <span className="text-sm">{lead.assignedTo.name}</span>
        </div>
      ) : (
        <span className="text-sm text-slate-500">Unassigned</span>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-400">Last contact</dt>
          <dd className="font-medium text-slate-700">{lead.lastContactAt ? <TimeAgo date={lead.lastContactAt} /> : "Never"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Next follow-up</dt>
          <dd suppressHydrationWarning className={clsx("font-medium", lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date() ? "text-rose-600" : "text-slate-700")}>
            {lead.nextFollowUpAt ? format(new Date(lead.nextFollowUpAt), "d MMM, h:mm a") : "—"}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function SiteCard({ lead, canPin, geofence }: { lead: Lead; canPin: boolean; geofence: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const pos = pending ?? (lead.lat != null && lead.lng != null ? { lat: lead.lat, lng: lead.lng } : null);

  async function confirm() {
    if (!pending) return;
    try {
      await api(`/api/leads/${lead.id}/actions`, { body: { action: "pinSite", ...pending } });
      toast.success("Site location confirmed", "All future check-ins and quotations are validated against this pin.");
      setPending(null);
      router.refresh();
    } catch (e) {
      toast.error("Could not pin", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer site</div>
        {lead.sitePinned ? (
          <Badge tone="green">
            <ShieldCheck className="h-3 w-3" /> Pin confirmed
          </Badge>
        ) : (
          <Badge tone="violet">Pin unconfirmed</Badge>
        )}
      </div>
      {pos ? (
        <Map height={200} markers={[{ id: "site", lat: pos.lat, lng: pos.lng, color: pending ? "#7c3aed" : "#ea580c", label: "Site" }]} circles={[{ lat: pos.lat, lng: pos.lng, radiusM: geofence }]} onPick={canPin ? (lat, lng) => setPending({ lat, lng }) : undefined} />
      ) : canPin ? (
        <Map height={200} markers={[]} onPick={(lat, lng) => setPending({ lat, lng })} />
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">No site location yet.</p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Green circle = {geofence} m geofence used to verify visits and quotations.</p>
      {canPin && (
        <div className="mt-2 flex items-center gap-2">
          {pending ? (
            <>
              <Button size="sm" variant="primary" onClick={confirm}>
                Confirm new pin
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <span className="text-[11px] text-slate-400">Managers: tap the map to set or correct the pin.</span>
          )}
        </div>
      )}
      {pos && (
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${pos.lat},${pos.lng}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-medium text-sky-700 hover:underline">
          Navigate with Google Maps →
        </a>
      )}
    </Card>
  );
}

/* ── Visits & quotes ────────────────────────────────────────────────────── */

function VisitsAndQuotes({ lead, onBook, quoteHref, canQuote }: { lead: Lead; onBook: () => void; quoteHref: string; canQuote: boolean }) {
  const appts = (lead.appointments ?? []) as any[];
  const quotes = (lead.quotations ?? []) as any[];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Appointments" action={<Button size="sm" onClick={onBook}>+ Book</Button>} icon={<CalendarPlus className="h-4 w-4" />} />
        {appts.length === 0 ? (
          <EmptyState title="No appointments yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {appts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {humanize(a.type)} · {format(new Date(a.startAt), "EEE d MMM, h:mm a")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.assignedTo?.name} {a.outcome && `· ${a.outcome}`}
                  </div>
                </div>
                {a.checkInVerdict && <VerdictBadge value={a.checkInVerdict} />}
                <Badge tone={a.status === "COMPLETED" ? "green" : a.status === "CANCELLED" || a.status === "NO_SHOW" ? "rose" : a.status === "CHECKED_IN" ? "sky" : "slate"}>{humanize(a.status)}</Badge>
                {a.googleEventId && <Badge tone="blue">Google ✓</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Quotations" icon={<FileText className="h-4 w-4" />} action={canQuote && <ButtonLink href={quoteHref} size="sm">+ New</ButtonLink>} />
        {quotes.length === 0 ? (
          <EmptyState title="No quotations yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {quotes.map((q) => (
              <li key={q.id}>
                <Link href={`/quotations/${q.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {q.number} · {q.systemKw} kW · {formatINR(q.netCost)} net
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="h-3 w-3" /> {format(new Date(q.serverTime), "d MMM yyyy, h:mm a")}
                      {q.distanceFromSiteM != null && ` · ${q.distanceFromSiteM} m from site`}
                    </div>
                  </div>
                  <VerdictBadge value={q.geoVerdict} />
                  <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "REJECTED" || q.status === "EXPIRED" ? "rose" : q.status === "SENT" ? "amber" : "slate"}>{humanize(q.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── Timeline & logging ─────────────────────────────────────────────────── */

function Timeline({ leadId, activities, onAdded }: { leadId: string; activities: Props["activities"]; onAdded: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function add() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await api(`/api/leads/${leadId}/actions`, { body: { action: "note", kind: "NOTE", body: note.trim() } });
      setNote("");
      onAdded();
    } catch (e) {
      toast.error("Could not add note", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <div className="flex gap-2 border-b border-slate-100 p-4">
        <textarea className="input min-h-[42px]" rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" />
        <Button onClick={add} loading={saving} variant="dark">
          Add
        </Button>
      </div>
      <ol className="relative space-y-0 px-5 py-4">
        {activities.map((a, i) => (
          <li key={a.id} className="relative flex gap-3 pb-5">
            {i < activities.length - 1 && <span className="absolute left-[13px] top-7 h-full w-px bg-slate-200" />}
            <span className={clsx("z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white", a.type === "AI" ? "bg-violet-100 text-violet-700" : a.type === "AUTOMATION" ? "bg-emerald-100 text-emerald-700" : a.type === "QUOTATION" || a.type === "CHECK_IN" ? "bg-sun-100 text-sun-700" : "bg-slate-100 text-slate-600")}>
              {ACT_ICON[a.type] ?? <Info className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-slate-800">{a.title}</p>
                <TimeAgo date={a.createdAt} className="text-[11px] text-slate-400" />
              </div>
              {a.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{a.body}</p>}
              {a.user && <p className="mt-0.5 text-[11px] text-slate-400">by {a.user.name}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function CallLogModal({ open, onClose, leadId }: { open: boolean; onClose: () => void; leadId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<"CALL" | "NOTE">("CALL");
  const [outcome, setOutcome] = useState("CONNECTED");
  const [body, setBody] = useState("");
  const [follow, setFollow] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(`/api/leads/${leadId}/actions`, { body: { action: "note", kind, callOutcome: kind === "CALL" ? outcome : undefined, body: body || (kind === "CALL" ? humanize(outcome) : ""), nextFollowUpAt: follow ? new Date(follow).toISOString() : undefined } });
      toast.success(kind === "CALL" ? "Call logged" : "Note added");
      setBody("");
      setFollow("");
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Log activity" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-4">
        <Segmented value={kind} onChange={(v) => setKind((v ?? "CALL") as "CALL" | "NOTE")} options={[{ value: "CALL", label: "📞 Call" }, { value: "NOTE", label: "📝 Note" }]} />
        {kind === "CALL" && (
          <Field label="Outcome">
            <Segmented value={outcome} onChange={(v) => setOutcome(v ?? "CONNECTED")} options={["CONNECTED", "NO_ANSWER", "BUSY", "SWITCHED_OFF", "CALL_BACK", "WRONG_NUMBER"].map((o) => ({ value: o, label: humanize(o) }))} />
          </Field>
        )}
        <Field label="Summary">
          <textarea className="input min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did the customer say?" />
        </Field>
        <Field label="Next follow-up (optional)">
          <input type="datetime-local" className="input" value={follow} onChange={(e) => setFollow(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function StageModal({ lead, mode, onClose }: { lead: Lead; mode: null | "WON" | "LOST" | "OTHER"; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState<string>(lead.stage);
  const [reason, setReason] = useState("");
  const [value, setValue] = useState<number | null>(lead.estimatedCost ?? null);
  const [saving, setSaving] = useState(false);
  const target = mode === "OTHER" ? stage : mode;
  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      await api(`/api/leads/${lead.id}/actions`, { body: { action: "stage", stage: target, lostReason: target === "LOST" ? reason : null, dealValue: target === "WON" ? value : null } });
      toast.success(target === "WON" ? "🎉 Deal won! Installation project created." : `Moved to ${STAGE_LABEL[target]}`);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Could not update stage", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={mode === "WON" ? "Mark as won" : mode === "LOST" ? "Mark as lost" : "Change stage"}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={mode === "LOST" ? "danger" : "primary"} onClick={save} loading={saving}>Confirm</Button></>}
    >
      <div className="space-y-4">
        {mode === "OTHER" && (
          <Field label="Stage">
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        {target === "WON" && (
          <Field label="Deal value (incl. GST)" hint="Opens the installation project with the PM Surya Ghar / DISCOM checklist.">
            <NumberInput prefix="₹" value={value} onChange={setValue} />
          </Field>
        )}
        {target === "LOST" && (
          <Field label="Why was it lost? *">
            <select className="input mb-2" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason…</option>
              {["Price too high / went with cheaper installer", "Loan not sanctioned", "Postponed — family decision", "Roof / structural issue", "Not the property owner", "Not reachable", "Chose a competitor brand"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
