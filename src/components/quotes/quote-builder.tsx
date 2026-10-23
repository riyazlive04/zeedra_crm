"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Crosshair, Loader2, ShieldCheck, ShieldAlert, MapPin, Send, FileText, Building2, CheckCircle2, XCircle } from "lucide-react";
import { Button, Card, CardHeader, Field, Badge } from "../ui";
import { NumberInput, Segmented, YesNo } from "../form-controls";
import { SolarEstimate } from "../solar-estimate";
import { VerdictBadge, VERDICT_META } from "../badges";
import { Map } from "../map/map";
import { api, getGpsFix, type GeoFix } from "@/lib/client";
import { useToast } from "../toast";
import { sizeSystem, type SegmentKey } from "@/lib/solar/sizing";
import { loanPlan } from "@/lib/solar/finance";
import { haversineM, formatDistance } from "@/lib/geo";
import type { OrgSettings } from "@/lib/settings";
import { format } from "date-fns";

interface LeadLite {
  id: string;
  name: string;
  code: string;
  segment: SegmentKey;
  monthlyBill: number | null;
  monthlyUnits: number | null;
  roofAreaSqft: number | null;
  sanctionedLoadKw: number | null;
  phase: string | null;
  lat: number | null;
  lng: number | null;
  sitePinned: boolean;
  paymentMode: string | null;
}

interface Check {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export function QuoteBuilder({
  lead,
  settings,
  mode,
  appointment,
}: {
  lead: LeadLite;
  settings: OrgSettings;
  mode: "FIELD" | "OFFICE";
  appointment: { id: string; startAt: string; endAt: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [kw, setKw] = useState<number | null>(null);
  const [panelBrand, setPanelBrand] = useState(settings.defaultPanelBrand);
  const [panelWattage, setPanelWattage] = useState(settings.defaultPanelWattage);
  const [inverterBrand, setInverterBrand] = useState(settings.defaultInverterBrand);
  const [structure, setStructure] = useState("Hot-dip galvanised elevated");
  const [discount, setDiscount] = useState<number | null>(null);
  const [loanOn, setLoanOn] = useState<boolean | null>(lead.paymentMode === "LOAN" || lead.paymentMode === "PARTIAL_LOAN");
  const [tenure, setTenure] = useState(settings.loanTenureMonths);
  const [rate, setRate] = useState<number | null>(settings.loanRatePct);
  const [down, setDown] = useState<number | null>(settings.loanDownPaymentPct);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | { id: string; number: string; verdict: string; checks: Check[]; distance: number | null }>(null);
  const [sending, setSending] = useState(false);

  const site = lead.lat != null && lead.lng != null ? { lat: lead.lat, lng: lead.lng } : null;
  const previewDistance = fix && site ? Math.round(haversineM(fix, site)) : null;
  const previewOk = previewDistance != null && previewDistance <= settings.geofenceRadiusM + Math.min(fix?.accuracyM ?? 0, settings.geofenceRadiusM / 2) && (fix?.accuracyM ?? 999) <= settings.maxGpsAccuracyM;

  const sizing = useMemo(
    () =>
      lead.monthlyBill || lead.monthlyUnits || kw
        ? sizeSystem(
            { monthlyBill: lead.monthlyBill, monthlyUnits: lead.monthlyUnits, segment: lead.segment, roofAreaSqft: kw ? null : lead.roofAreaSqft, sanctionedLoadKw: lead.sanctionedLoadKw, phase: lead.phase, overrideKw: kw, panelWattage, discount: discount ?? 0 },
            settings,
          )
        : null,
    [lead, kw, panelWattage, discount, settings],
  );
  const loan = sizing && loanOn ? loanPlan(sizing.netCost, sizing.monthlySavings, rate ?? settings.loanRatePct, tenure, down ?? 0) : null;

  async function locate() {
    setLocating(true);
    setGpsError(null);
    try {
      setFix(await getGpsFix(25, 20000));
    } catch (e) {
      setGpsError(e instanceof Error ? e.message : "GPS failed");
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    if (!sizing) return toast.error("Add the customer's bill or a system size first");
    setSaving(true);
    try {
      let capture: GeoFix | null = null;
      if (mode === "FIELD") {
        // Always take a fresh fix at the moment of creation — the server validates time and place together.
        capture = await getGpsFix(30, 15000).catch((e) => {
          throw new Error(e instanceof Error ? e.message : "GPS failed");
        });
        setFix(capture);
      }
      const r = await api<{ quotation: { id: string; number: string; geoVerdict: string; distanceFromSiteM: number | null }; validation: { checks: Check[] } | null }>("/api/quotations", {
        body: {
          leadId: lead.id,
          appointmentId: appointment?.id ?? null,
          mode,
          systemKw: kw,
          panelBrand,
          panelWattage,
          inverterBrand,
          structureType: structure,
          discount: discount ?? 0,
          loan: loanOn ? { enabled: true, tenureMonths: tenure, ratePct: rate ?? settings.loanRatePct, downPaymentPct: down ?? 0 } : undefined,
          notes: notes || null,
          capture,
        },
      });
      setResult({ id: r.quotation.id, number: r.quotation.number, verdict: r.quotation.geoVerdict, checks: r.validation?.checks ?? [], distance: r.quotation.distanceFromSiteM });
      if (r.quotation.geoVerdict === "VERIFIED" || r.quotation.geoVerdict === "OFFICE_CREATED") toast.success(`Quotation ${r.quotation.number} created`);
      else toast.info(`Quotation ${r.quotation.number} created — flagged for review`, VERDICT_META[r.quotation.geoVerdict]?.help);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error("Could not create quotation", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  async function sendToCustomer() {
    if (!result) return;
    setSending(true);
    try {
      const r = await api<{ link: string; whatsapp: { status: string; waLink: string } | null }>(`/api/quotations/${result.id}`, { body: { action: "send", via: "WHATSAPP" } });
      if (r.whatsapp?.status === "SIMULATED") window.open(r.whatsapp.waLink, "_blank");
      toast.success("Proposal sent to customer", "Shared on WhatsApp with a secure link.");
      router.push(`/quotations/${result.id}`);
    } catch (e) {
      toast.error("Could not send", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  }

  if (result) {
    const ok = result.verdict === "VERIFIED" || result.verdict === "OFFICE_CREATED";
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className={clsx("p-6 text-center", ok ? "border-emerald-200" : "border-amber-200")}>
          <div className={clsx("mx-auto flex h-14 w-14 items-center justify-center rounded-2xl", ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
            {ok ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
          </div>
          <h2 className="mt-3 font-display text-xl font-bold">Quotation {result.number}</h2>
          <div className="mt-2">
            <VerdictBadge value={result.verdict} />
          </div>
          <p className="mt-2 text-sm text-slate-500">{VERDICT_META[result.verdict]?.help}</p>
          {result.checks.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-left">
              {result.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  {c.passed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-600" />}
                  <span>
                    <b className="text-slate-700">{c.label}:</b> <span className="text-slate-600">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={sendToCustomer} loading={sending}>
              <Send className="h-4 w-4" /> Send on WhatsApp
            </Button>
            <Link href={`/quotations/${result.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium shadow-sm hover:bg-slate-50">
              <FileText className="h-4 w-4" /> View proposal
            </Link>
          </div>
        </Card>
        <Link href={`/leads/${lead.id}`} className="block text-center text-sm text-slate-500 hover:text-slate-800">
          Back to {lead.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        {mode === "FIELD" ? (
          <Card>
            <CardHeader
              title="Location check"
              subtitle={`Quotations must be created at the customer's site (within ${settings.geofenceRadiusM} m)${appointment ? ` during the ${format(new Date(appointment.startAt), "h:mm a")} visit` : ""}`}
              icon={<Crosshair className="h-4 w-4" />}
              action={
                <Button size="sm" onClick={locate} disabled={locating}>
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  {fix ? "Re-check" : "Check my location"}
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              {gpsError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{gpsError}</p>}
              {!site && <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">This customer&apos;s site is not pinned yet. The quotation will be flagged &quot;Site not pinned&quot; for manager review — that is expected for first visits.</p>}
              {fix && (
                <div className={clsx("flex flex-wrap items-center gap-3 rounded-xl px-4 py-3", previewOk ? "bg-emerald-50" : site ? "bg-amber-50" : "bg-slate-50")}>
                  <MapPin className={clsx("h-5 w-5", previewOk ? "text-emerald-600" : "text-amber-600")} />
                  <div className="text-sm">
                    <div className="font-semibold text-slate-800">{previewDistance != null ? `${formatDistance(previewDistance)} from site` : "Location captured"}</div>
                    <div className="text-xs text-slate-500">
                      GPS accuracy ±{fix.accuracyM} m {fix.accuracyM > settings.maxGpsAccuracyM && "— too weak, step outside and re-check"}
                    </div>
                  </div>
                  <Badge tone={previewOk ? "green" : "amber"} className="ml-auto">
                    {previewOk ? "Looks good" : site ? "Outside geofence" : "Site not pinned"}
                  </Badge>
                </div>
              )}
              {(site || fix) && (
                <Map
                  height={240}
                  markers={[
                    ...(site ? [{ id: "site", lat: site.lat, lng: site.lng, color: "#ea580c", label: "Customer site" }] : []),
                    ...(fix ? [{ id: "me", lat: fix.lat, lng: fix.lng, color: "#2563eb", label: "You", ring: true }] : []),
                  ]}
                  circles={[...(site ? [{ lat: site.lat, lng: site.lng, radiusM: settings.geofenceRadiusM }] : []), ...(fix ? [{ lat: fix.lat, lng: fix.lng, radiusM: fix.accuracyM, color: "#2563eb" }] : [])]}
                />
              )}
              <p className="text-[11px] text-slate-500">A fresh GPS reading and the server&apos;s clock are recorded the moment you create the quotation. Location, time slot, clock tampering and travel speed are all verified automatically.</p>
            </div>
          </Card>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
            <Building2 className="h-5 w-5 text-slate-400" /> Office quotation — recorded as created by a manager without site validation.
          </div>
        )}

        <Card>
          <CardHeader title="System configuration" subtitle={`${lead.name} · ${lead.code}`} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="System size" hint={sizing ? `Recommended ${sizeSystem({ monthlyBill: lead.monthlyBill, monthlyUnits: lead.monthlyUnits, segment: lead.segment, roofAreaSqft: lead.roofAreaSqft }, settings).recommendedKw} kW from the bill` : "Enter kW"}>
              <NumberInput suffix="kW" value={kw} onChange={setKw} placeholder="Auto" />
            </Field>
            <Field label="Panel wattage">
              <Segmented value={String(panelWattage)} onChange={(v) => setPanelWattage(Number(v ?? settings.defaultPanelWattage))} options={["440", "540", "550", "575", "590"].map((w) => ({ value: w, label: `${w} W` }))} />
            </Field>
            <Field label="Panel brand">
              <select className="input" value={panelBrand} onChange={(e) => setPanelBrand(e.target.value)}>
                {settings.panelBrands.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Inverter brand">
              <select className="input" value={inverterBrand} onChange={(e) => setInverterBrand(e.target.value)}>
                {settings.inverterBrands.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Mounting structure">
              <select className="input" value={structure} onChange={(e) => setStructure(e.target.value)}>
                {["Hot-dip galvanised elevated", "Hot-dip galvanised standard", "Aluminium rail (metal sheet roof)", "Hook mount (tiled roof)", "Ground mount"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Discount (pre-GST)">
              <NumberInput prefix="₹" value={discount} onChange={setDiscount} placeholder="0" />
            </Field>
            <Field label="Include loan / EMI plan?" className="sm:col-span-2">
              <YesNo value={loanOn} onChange={setLoanOn} />
            </Field>
            {loanOn && (
              <div className="grid gap-3 rounded-xl bg-sky-50/70 p-3 sm:col-span-2 sm:grid-cols-3">
                <Field label="Tenure">
                  <select className="input" value={tenure} onChange={(e) => setTenure(Number(e.target.value))}>
                    {[24, 36, 60, 84, 120].map((m) => (
                      <option key={m} value={m}>
                        {m / 12} years
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Interest">
                  <NumberInput suffix="% p.a." value={rate} onChange={setRate} />
                </Field>
                <Field label="Down payment">
                  <NumberInput suffix="%" value={down} onChange={setDown} />
                </Field>
              </div>
            )}
            <Field label="Notes on the proposal" className="sm:col-span-2">
              <textarea className="input min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Includes 2 walkway, 1 water-sprinkler line" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card className="p-4">
          {sizing ? <SolarEstimate r={sizing} loan={loan} dense /> : <p className="p-6 text-center text-sm text-slate-500">Enter a system size — this lead has no bill data yet.</p>}
        </Card>
        <Button variant="primary" size="lg" className="w-full" onClick={submit} loading={saving} disabled={!sizing}>
          {mode === "FIELD" ? <Crosshair className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          {mode === "FIELD" ? "Verify location & create quotation" : "Create quotation"}
        </Button>
      </div>
    </div>
  );
}
