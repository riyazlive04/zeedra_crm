"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Crosshair, Loader2, ShieldCheck, ShieldAlert, MapPin, Send, FileText, Building2, CheckCircle2, XCircle } from "lucide-react";
import { Button, Card, CardHeader, Field, Badge } from "../ui";
import { VerdictBadge, VERDICT_META } from "../badges";
import { Map } from "../map/map";
import { api, getGpsFix, type GeoFix } from "@/lib/client";
import { useToast } from "../toast";
import { haversineM, formatDistance } from "@/lib/geo";
import type { OrgSettings } from "@/lib/settings";
import { format } from "date-fns";
import {
  calcTNEBBimonthlyBill,
  computeQuotify,
  defaultWattFor,
  fmtINR,
  INVERTER_BRANDS,
  invSizeList,
  PANEL_BRANDS,
  quotationConfig,
  QuotifyInputError,
  reverseCalcTNEBBimonthlyUnits,
  WATTAGE_OPTIONS,
  wattOptions,
  type PanelTech,
  type Phase,
  type QuotifyInput,
  type Structure,
  type SysType,
} from "@/lib/solar/quotify";

interface LeadLite {
  id: string;
  name: string;
  code: string;
  phone: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  consumerNumber: string | null;
  monthlyBill: number | null;
  monthlyUnits: number | null;
  phase: string | null;
  lat: number | null;
  lng: number | null;
  sitePinned: boolean;
}

interface Check {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

const SYS_OPTIONS: { value: SysType; label: string; sub: string }[] = [
  { value: "dcr", label: "On-Grid DCR", sub: "Govt subsidy eligible" },
  { value: "ndcr", label: "On-Grid NDCR", sub: "Cost-effective" },
  { value: "hybrid", label: "Hybrid", sub: "With battery backup" },
  { value: "micro", label: "Micro Inverter", sub: "Premium option" },
];
const PANEL_OPTIONS: { value: PanelTech; label: string; sub: string }[] = [
  { value: "bifacial", label: "Bifacial", sub: "Standard DCR" },
  { value: "topcon", label: "TOPCon", sub: "High efficiency" },
  { value: "hjt", label: "HJT", sub: "Ultra premium" },
];
const OTHERS = "others";

/** A brand select with an "Others" free-text fallback, as on the quotation form. */
function BrandSelect({ brands, value, onChange }: { brands: string[]; value: string; onChange: (v: string) => void }) {
  const match = brands.find((b) => b.toLowerCase() === value.toLowerCase());
  const [custom, setCustom] = useState(!match);
  return (
    <>
      <select
        className="input"
        value={custom ? OTHERS : (match ?? OTHERS)}
        onChange={(e) => {
          if (e.target.value === OTHERS) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
        <option value={OTHERS}>Others</option>
      </select>
      {custom && <input className="input mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter brand name" />}
    </>
  );
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-lg border px-3 py-2 text-sm font-medium transition",
            value === o.value ? "border-sun-500 bg-sun-50 text-sun-800 ring-1 ring-sun-500/30" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OptionCards<T extends string>({ value, onChange, options, cols }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; sub: string }[]; cols: 2 | 3 }) {
  return (
    <div className={clsx("grid gap-2", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-xl border px-3 py-3 text-center transition",
            value === o.value ? "border-sun-500 bg-sun-50 ring-1 ring-sun-500/30" : "border-slate-200 bg-white hover:border-slate-300",
          )}
        >
          <div className={clsx("text-sm font-semibold", value === o.value ? "text-sun-800" : "text-slate-700")}>{o.label}</div>
          <div className="text-[11px] text-slate-500">{o.sub}</div>
        </button>
      ))}
    </div>
  );
}

function CableSelect({ value, onChange, prefix }: { value: string; onChange: (v: string) => void; prefix: string }) {
  const standard = ["4", "6", "8"];
  const [other, setOther] = useState(!standard.includes(value));
  return (
    <>
      <select
        className="input"
        value={other ? "other" : value}
        onChange={(e) => {
          if (e.target.value === "other") setOther(true);
          else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        {standard.map((s) => (
          <option key={s} value={s}>
            {prefix}
            {s} sq.mm
          </option>
        ))}
        <option value="other">Other</option>
      </select>
      {other && (
        <input
          type="number"
          step="0.5"
          min="0.5"
          className="input mt-1.5"
          placeholder="Enter size in sq.mm"
          defaultValue={standard.includes(value) ? "" : value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      )}
    </>
  );
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function QuoteBuilder({
  lead,
  settings,
  mode,
  appointment,
}: {
  lead: LeadLite | null;
  settings: OrgSettings;
  mode: "FIELD" | "OFFICE";
  appointment: { id: string; startAt: string; endAt: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const cfg = useMemo(() => quotationConfig(settings), [settings]);
  const { P, custom } = cfg;

  const [fix, setFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Customer Details
  const [custName, setCustName] = useState(lead?.name ?? "");
  const [custPhone, setCustPhone] = useState((lead?.phone ?? "").replace(/\D/g, "").slice(-10));
  const [custAddress, setCustAddress] = useState(lead ? [lead.address, lead.city].filter(Boolean).join(", ") : "");
  const [custPin, setCustPin] = useState(lead?.pincode ?? "");
  const [custEb, setCustEb] = useState(lead?.consumerNumber ?? "");

  // System Size
  const [sizeMode, setSizeMode] = useState<"eb" | "direct">("eb");
  const [units, setUnits] = useState(lead?.monthlyUnits ? String(Math.round(lead.monthlyUnits * 2)) : "");
  const [bill, setBill] = useState(!lead?.monthlyUnits && lead?.monthlyBill ? String(Math.round(lead.monthlyBill * 2)) : "");
  const [directKw, setDirectKw] = useState("");

  // Building Type & Wiring
  const [structure, setStructure] = useState<Structure>("lowrise");
  const [floors, setFloors] = useState("");
  const [dcCable, setDcCable] = useState("4");
  const [acCable, setAcCable] = useState("4");

  // System Type, Panel Technology, Inverter Options
  const initialPanel = cfg.defaultPanelType;
  const [systemType, setSystemTypeState] = useState<SysType>("dcr");
  const [panelType, setPanelTypeState] = useState<PanelTech>(initialPanel);
  const [wattOpts, setWattOpts] = useState<number[]>(() => wattOptions(initialPanel, custom));
  const [panelWatt, setPanelWatt] = useState(() => defaultWattFor(initialPanel, P, custom));
  const [panelBrand, setPanelBrand] = useState<string>(initialPanel === "bifacial" ? P.brand_dcr_panel : P.brand_ndcr_panel);
  const [panelBrandKey, setPanelBrandKey] = useState(0);
  const [phase, setPhaseState] = useState<Phase>(lead?.phase === "THREE" ? "three" : "single");
  const [invChoice, setInvChoice] = useState("0"); // "0" = auto, a kW value, or "custom"
  const [invCustom, setInvCustom] = useState("");
  const [inverterBrand, setInverterBrand] = useState<string>(P.brand_ongrid_inv);
  const [invBrandKey, setInvBrandKey] = useState(0);

  // Adjust Final Quote Price
  const [overrideTotal, setOverrideTotal] = useState("");

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<null | {
    id: string;
    number: string;
    verdict: string;
    checks: Check[];
    leadId: string;
    leadName: string;
  }>(null);

  function setPanelType(t: PanelTech) {
    setPanelTypeState(t);
    const opts = wattOptions(t, custom);
    setWattOpts(opts);
    setPanelWatt(defaultWattFor(t, P, custom));
    setPanelBrand(t === "bifacial" ? P.brand_dcr_panel : P.brand_ndcr_panel);
    setPanelBrandKey((k) => k + 1);
  }

  function setSystemType(t: SysType) {
    setSystemTypeState(t);
    // Switching system type resets panel technology (NDCR → TOPCon, others → Bifacial), its standard wattages and brands.
    const pType: PanelTech = t === "ndcr" ? "topcon" : "bifacial";
    setPanelTypeState(pType);
    const opts = WATTAGE_OPTIONS[pType];
    setWattOpts(opts);
    const defW = t === "ndcr" ? P.ndcr_panel_w : P.dcr_panel_w;
    setPanelWatt(opts.reduce((b, o) => (Math.abs(o - defW) < Math.abs(b - defW) ? o : b), opts[0]));
    setPanelBrand(pType === "bifacial" ? P.brand_dcr_panel : P.brand_ndcr_panel);
    setPanelBrandKey((k) => k + 1);
    setInverterBrand(t === "hybrid" ? P.brand_hybrid_inv : t === "micro" ? P.brand_micro_inv : P.brand_ongrid_inv);
    setInvBrandKey((k) => k + 1);
    setInvChoice("0");
    setInvCustom("");
  }

  function setPhase(p: Phase) {
    setPhaseState(p);
    setInvChoice("0");
    setInvCustom("");
  }

  const invSizes = invSizeList(phase === "three" ? "inv_3ph" : "inv_1ph", P, custom).map((s) => s.kw);
  const inverterKw = invChoice === "custom" ? Number(invCustom) || 0 : Number(invChoice) || 0;

  const quoteInput: QuotifyInput = {
    sizeMode,
    bimonthlyUnits: numOrNull(units),
    bimonthlyBill: numOrNull(bill),
    directKw: numOrNull(directKw),
    structure,
    floors: numOrNull(floors),
    dcCableSize: dcCable,
    acCableSize: acCable,
    systemType,
    panelType,
    panelWatt,
    panelBrand: panelBrand.trim() || null,
    inverterBrand: inverterBrand.trim() || null,
    inverterPhase: phase,
    inverterKw: inverterKw || null,
    overrideTotal: numOrNull(overrideTotal),
  };

  let preview: ReturnType<typeof computeQuotify> | null = null;
  let previewError: string | null = null;
  try {
    preview = computeQuotify(quoteInput, P, custom, { stateSubsidy: cfg.stateSubsidy, companyName: "" });
  } catch (e) {
    previewError = e instanceof QuotifyInputError ? e.message : "Check the form";
  }

  const site = lead?.lat != null && lead?.lng != null ? { lat: lead.lat, lng: lead.lng } : null;
  const previewDistance = fix && site ? Math.round(haversineM(fix, site)) : null;
  const previewOk = previewDistance != null && previewDistance <= settings.geofenceRadiusM + Math.min(fix?.accuracyM ?? 0, settings.geofenceRadiusM / 2) && (fix?.accuracyM ?? 999) <= settings.maxGpsAccuracyM;

  const unitsN = Number(units);
  const billN = Number(bill);
  const billPlaceholder = unitsN > 0 ? `≈ ₹${Math.round(calcTNEBBimonthlyBill(unitsN)).toLocaleString("en-IN")}` : "Bill Amount";
  const unitsPlaceholder = billN > 0 ? `≈ ${Math.round(reverseCalcTNEBBimonthlyUnits(billN))} units` : "Units";

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
    if (!custName.trim()) return toast.error("Please enter the customer's name.");
    if (!/^[6-9][0-9]{9}$/.test(custPhone.trim())) return toast.error("Mobile number must be 10 digits.");
    if (!/^[1-9][0-9]{5}$/.test(custPin.trim())) return toast.error(custPin.trim() ? "PIN code must be 6 digits." : "Please enter the customer's PIN code.");
    if (!preview) return toast.error(previewError ?? "Check the form");
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
      const r = await api<{
        quotation: { id: string; number: string; geoVerdict: string };
        validation: { checks: Check[] } | null;
        lead: { id: string; name: string; code: string };
        leadCreated: boolean;
        leadDuplicate: boolean;
      }>("/api/quotations", {
        body: {
          ...(lead ? { leadId: lead.id } : {}),
          customer: { name: custName.trim(), phone: custPhone.trim(), address: custAddress.trim(), pincode: custPin.trim(), ebNumber: custEb.trim() },
          appointmentId: appointment?.id ?? null,
          mode,
          quote: quoteInput,
          capture,
        },
      });
      setResult({ id: r.quotation.id, number: r.quotation.number, verdict: r.quotation.geoVerdict, checks: r.validation?.checks ?? [], leadId: r.lead.id, leadName: r.lead.name });
      if (r.quotation.geoVerdict === "VERIFIED" || r.quotation.geoVerdict === "OFFICE_CREATED") {
        toast.success(`Quotation ${r.quotation.number} created`, r.leadDuplicate ? `Matched an existing customer: ${r.lead.name} (${r.lead.code}).` : r.leadCreated ? `New lead ${r.lead.code} created for ${r.lead.name}.` : undefined);
      } else toast.info(`Quotation ${r.quotation.number} created and flagged for review`, VERDICT_META[r.quotation.geoVerdict]?.help);
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
              <FileText className="h-4 w-4" /> View quotation
            </Link>
          </div>
        </Card>
        <Link href={`/leads/${result.leadId}`} className="block text-center text-sm text-slate-500 hover:text-slate-800">
          Back to {result.leadName}
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
              {!site && <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">This customer&apos;s site is not pinned yet. The quotation will be flagged &quot;Site not pinned&quot; for manager review. That's expected on a first visit.</p>}
              {fix && (
                <div className={clsx("flex flex-wrap items-center gap-3 rounded-xl px-4 py-3", previewOk ? "bg-emerald-50" : site ? "bg-amber-50" : "bg-slate-50")}>
                  <MapPin className={clsx("h-5 w-5", previewOk ? "text-emerald-600" : "text-amber-600")} />
                  <div className="text-sm">
                    <div className="font-semibold text-slate-800">{previewDistance != null ? `${formatDistance(previewDistance)} from site` : "Location captured"}</div>
                    <div className="text-xs text-slate-500">
                      GPS accuracy ±{fix.accuracyM} m {fix.accuracyM > settings.maxGpsAccuracyM && "· too weak, step outside and check again"}
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
            <Building2 className="h-5 w-5 text-slate-400" /> Office quotation. It's recorded as created by a manager, without a site check.
          </div>
        )}

        <Card>
          <CardHeader title="Customer Details" subtitle={lead ? `${lead.name} · ${lead.code}` : "A lead is created automatically with this quotation"} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Customer Name">
              <input className="input" value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="e.g. Mr. Ramesh Kumar" />
            </Field>
            <Field label="Phone Number">
              <input className="input" type="tel" inputMode="numeric" autoComplete="tel-national" value={custPhone} onChange={(e) => setCustPhone(e.target.value.replace(/\D/g, "").slice(-10))} placeholder="9876543210" />
            </Field>
            <Field label="Address / Area" className="sm:col-span-2">
              <input className="input" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="e.g. Arakkonam, Vellore District" />
            </Field>
            <Field label="PIN Code">
              <input className="input" type="tel" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={custPin} onChange={(e) => setCustPin(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 631001" />
            </Field>
            <Field label="EB Consumer Number (optional)">
              <input className="input" maxLength={30} value={custEb} onChange={(e) => setCustEb(e.target.value)} placeholder="e.g. 09-123-456-789" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="System Size" />
          <div className="space-y-4 p-5">
            <Toggle value={sizeMode} onChange={setSizeMode} options={[{ value: "eb", label: "From EB Bill" }, { value: "direct", label: "Enter kW Size" }]} />
            {sizeMode === "eb" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bi-Monthly Units (as per TNEB bill)">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={units}
                    placeholder={unitsPlaceholder}
                    onChange={(e) => {
                      setUnits(e.target.value);
                      if (Number(e.target.value) > 0) setBill("");
                    }}
                  />
                </Field>
                <Field label="Bi-Monthly EB Bill Amount (₹)">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={bill}
                    placeholder={billPlaceholder}
                    onChange={(e) => {
                      setBill(e.target.value);
                      if (Number(e.target.value) > 0) setUnits("");
                    }}
                  />
                </Field>
              </div>
            ) : (
              <Field label="System Size (kW)">
                <input className="input" type="number" step="0.1" min="0.5" max="50" inputMode="decimal" value={directKw} onChange={(e) => setDirectKw(e.target.value)} placeholder="e.g. 3.3" />
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Building Type" />
          <div className="space-y-4 p-5">
            <Field label="Structure Type">
              <Toggle value={structure} onChange={setStructure} options={[{ value: "lowrise", label: "Low-Rise / Ground" }, { value: "highrise", label: "High-Rise / Flat" }]} />
            </Field>
            {structure === "highrise" && (
              <Field label="Number of Floors (above ground)" hint="Used to calculate wiring length">
                <input className="input" type="number" min="1" max="30" inputMode="numeric" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder="e.g. 3" />
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Wiring" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="DC Cable Size">
              <CableSelect value={dcCable} onChange={setDcCable} prefix="" />
            </Field>
            <Field label="AC Copper Cable Size">
              <CableSelect value={acCable} onChange={setAcCable} prefix="3C, " />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="System Type" />
          <div className="p-5">
            <OptionCards value={systemType} onChange={setSystemType} options={SYS_OPTIONS} cols={2} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Panel Technology" />
          <div className="space-y-4 p-5">
            <OptionCards value={panelType} onChange={setPanelType} options={PANEL_OPTIONS} cols={3} />
            {panelType === "hjt" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">HJT panels are ultra-premium. Confirm stock before quoting.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Panel Wattage">
                <select className="input" value={panelWatt} onChange={(e) => setPanelWatt(Number(e.target.value))}>
                  {wattOpts.map((w) => (
                    <option key={w} value={w}>
                      {w}W
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Panel Brand">
                <BrandSelect key={panelBrandKey} brands={panelType === "bifacial" ? PANEL_BRANDS.dcr : PANEL_BRANDS.ndcr} value={panelBrand} onChange={setPanelBrand} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Inverter Options" />
          <div className="space-y-4 p-5">
            <Field label="Phase Type">
              <Toggle value={phase} onChange={setPhase} options={[{ value: "single", label: "Single" }, { value: "three", label: "Three" }]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Inverter Capacity">
                <select className="input" value={invChoice} onChange={(e) => setInvChoice(e.target.value)}>
                  <option value="0">Auto (based on system size)</option>
                  {invSizes.map((s) => (
                    <option key={s} value={String(s)}>
                      {s} kW
                    </option>
                  ))}
                  <option value="custom">Custom size…</option>
                </select>
                {invChoice === "custom" && (
                  <input className="input mt-1.5" type="number" step="0.1" min="0.5" value={invCustom} onChange={(e) => setInvCustom(e.target.value)} placeholder="Enter size in kW, e.g. 3.3" />
                )}
              </Field>
              <Field label="Inverter Brand">
                <BrandSelect
                  key={invBrandKey}
                  brands={systemType === "hybrid" ? INVERTER_BRANDS.hybrid : systemType === "micro" ? INVERTER_BRANDS.micro : INVERTER_BRANDS.ongrid}
                  value={inverterBrand}
                  onChange={setInverterBrand}
                />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader title={preview ? preview.title : "Quotation"} />
          {preview ? (
            <div className="space-y-3 p-4 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="System" value={`${preview.actualKw} kW`} />
                <Stat label="Panels" value={`${preview.panels} × ${preview.panelWatt}W`} />
                <Stat label="Inverter" value={preview.inverterLabel || "Micro"} />
              </div>
              <dl className="space-y-1.5">
                <Row l="Sub Total (Before GST)" v={fmtINR(preview.preTax)} />
                <Row l={`GST @ ${preview.blendPct}% (blended) included in total`} v={fmtINR(preview.gst)} />
                <Row l="TOTAL (Incl. GST)" v={fmtINR(preview.grandTotal)} bold />
                {preview.subsidy > 0 && (
                  <>
                    <Row l="Less: Govt Subsidy" v={`− ${fmtINR(preview.subsidy)}`} className="text-emerald-700" />
                    <Row l="NET COST AFTER SUBSIDY" v={fmtINR(preview.netCost)} bold />
                  </>
                )}
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Bi-Monthly Saving" value={fmtINR(preview.savings.bimonthlySave)} />
                <Stat label="Annual Saving" value={fmtINR(preview.savings.annualSave)} />
                <Stat label="Payback Period" value={`${preview.savings.paybackYrs.toFixed(1)} yrs`} />
                <Stat label="30-Year Net Gain" value={fmtINR(preview.savings.netBenefit30)} />
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <Field label="Adjust Final Quote Price" hint={`Calculated: ${fmtINR(preview.calcTotal)}`}>
                  <input className="input" type="number" step="500" value={overrideTotal} onChange={(e) => setOverrideTotal(e.target.value)} placeholder="Enter custom price" />
                </Field>
                {overrideTotal && Number(overrideTotal) < 1000 && <p className="mt-1 text-xs text-rose-600">Enter a price of at least ₹1,000.</p>}
              </div>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">{previewError}</p>
          )}
        </Card>
        <Button variant="primary" size="lg" className="w-full" onClick={submit} loading={saving} disabled={!preview}>
          {mode === "FIELD" ? <Crosshair className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          {mode === "FIELD" ? "Verify location & generate quotation →" : "Generate Quotation →"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-display text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Row({ l, v, bold, className }: { l: string; v: string; bold?: boolean; className?: string }) {
  return (
    <div className={clsx("flex items-start justify-between gap-3", className)}>
      <dt className={bold ? "font-semibold text-slate-800" : "text-slate-600"}>{l}</dt>
      <dd className={clsx("shrink-0 tabular-nums", bold && "font-semibold text-slate-900")}>{v}</dd>
    </div>
  );
}
