"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Sun } from "lucide-react";
import { Button, Card, CardHeader, Field } from "../ui";
import { NumberInput, Segmented, YesNo } from "../form-controls";
import { BillReader } from "../bill-reader";
import { SolarEstimate } from "../solar-estimate";
import { Map } from "../map/map";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import { sizeSystem, type SegmentKey } from "@/lib/solar/sizing";
import { loanPlan } from "@/lib/solar/finance";
import { basicQualification } from "@/lib/qualification";
import type { OrgSettings } from "@/lib/settings";
import { humanize } from "@/lib/text";
import { ROOF_TYPES, SEGMENTS, SOURCES } from "@/lib/validators";

type Form = {
  name: string;
  phone: string;
  email: string;
  source: string;
  campaign: string;
  segment: SegmentKey;
  address: string;
  city: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  monthlyBill: number | null;
  monthlyUnits: number | null;
  discom: string;
  consumerNumber: string;
  sanctionedLoadKw: number | null;
  phase: "SINGLE" | "THREE" | null;
  ownsProperty: boolean | null;
  roofType: string | null;
  roofAreaSqft: number | null;
  shadowFree: boolean | null;
  assignedToId: string;
};

export function NewLeadForm({ settings, users, canAssign }: { settings: OrgSettings; users: { id: string; name: string; role: string }[]; canAssign: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<Form>({
    name: "", phone: "", email: "", source: "WALK_IN", campaign: "", segment: "RESIDENTIAL", address: "", city: "", pincode: "",
    lat: null, lng: null, monthlyBill: null, monthlyUnits: null, discom: "", consumerNumber: "", sanctionedLoadKw: null, phase: null,
    ownsProperty: null, roofType: null, roofAreaSqft: null, shadowFree: null, assignedToId: "",
  });
  const [saving, setSaving] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number; label: string }[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const sizing = useMemo(
    () =>
      f.monthlyBill || f.monthlyUnits
        ? sizeSystem({ monthlyBill: f.monthlyBill, monthlyUnits: f.monthlyUnits, segment: f.segment, roofAreaSqft: f.roofAreaSqft, sanctionedLoadKw: f.sanctionedLoadKw, phase: f.phase }, settings)
        : null,
    [f.monthlyBill, f.monthlyUnits, f.segment, f.roofAreaSqft, f.sanctionedLoadKw, f.phase, settings],
  );
  const loan = sizing ? loanPlan(sizing.netCost, sizing.monthlySavings, settings.loanRatePct, settings.loanTenureMonths, settings.loanDownPaymentPct) : null;
  const basic = basicQualification({ ...f }, settings);

  async function lookup() {
    const q = [f.address, f.city, f.pincode].filter(Boolean).join(", ");
    if (q.length < 4) return toast.info("Enter the address first");
    setGeoLoading(true);
    try {
      const r = await api<{ lat: number; lng: number; label: string }[]>(`/api/geocode?q=${encodeURIComponent(q)}`);
      setGeo(r);
      if (r[0]) setF((x) => ({ ...x, lat: r[0].lat, lng: r[0].lng }));
      else toast.info("Address not found", "Tap the map to drop the pin manually.");
    } catch (e) {
      toast.error("Lookup failed", e instanceof Error ? e.message : undefined);
    } finally {
      setGeoLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...f, assignedToId: f.assignedToId || null, email: f.email || null };
      const r = await api<{ lead: { id: string; code: string }; duplicate: boolean }>("/api/leads", { body });
      if (r.duplicate) toast.info("This customer already exists", `Opened existing lead ${r.lead.code} and logged the repeat enquiry.`);
      else toast.success("Lead created", `${r.lead.code} scored, assigned and welcomed on WhatsApp.`);
      router.push(`/leads/${r.lead.id}`);
      router.refresh();
    } catch (err) {
      toast.error("Could not save lead", err instanceof Error ? err.message : undefined);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Customer" subtitle="Who is enquiring" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name *">
              <input className="input" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ravi Kumar" />
            </Field>
            <Field label="Mobile (WhatsApp) *">
              <input className="input" required inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Source">
              <select className="input" value={f.source} onChange={(e) => set("source", e.target.value)}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Segment" className="sm:col-span-2">
              <Segmented value={f.segment} onChange={(v) => set("segment", (v ?? "RESIDENTIAL") as SegmentKey)} options={SEGMENTS.map((s) => ({ value: s, label: humanize(s) }))} />
            </Field>
            <Field label="Campaign">
              <input className="input" value={f.campaign} onChange={(e) => set("campaign", e.target.value)} placeholder="Optional" />
            </Field>
            {canAssign && (
              <Field label="Assign to" hint="Leave blank for automatic round-robin">
                <select className="input" value={f.assignedToId} onChange={(e) => set("assignedToId", e.target.value)}>
                  <option value="">Auto-assign</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {humanize(u.role)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Site location" subtitle="The pin is the reference point for GPS-verified visits and quotations" icon={<MapPin className="h-4 w-4" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label="Address">
              <input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Door no, street, area" />
            </Field>
            <Field label="City">
              <input className="input" value={f.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="PIN code">
              <input className="input" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <div className="sm:col-span-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={lookup} loading={geoLoading}>
                  <Search className="h-3.5 w-3.5" /> Find address on map
                </Button>
                <span className="text-xs text-slate-500">{f.lat ? `Pinned at ${f.lat.toFixed(5)}, ${f.lng!.toFixed(5)} — tap the map to adjust` : "Or tap the map to drop the pin"}</span>
              </div>
              {geo.length > 1 && (
                <select className="input mb-2 text-xs" onChange={(e) => { const g = geo[Number(e.target.value)]; setF((x) => ({ ...x, lat: g.lat, lng: g.lng })); }}>
                  {geo.map((g, i) => (
                    <option key={i} value={i}>
                      {g.label}
                    </option>
                  ))}
                </select>
              )}
              <Map height={260} markers={f.lat && f.lng ? [{ id: "site", lat: f.lat, lng: f.lng, color: "#ea580c", label: "Customer site", radius: 9 }] : []} onPick={(lat, lng) => setF((x) => ({ ...x, lat, lng }))} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Basic qualification" subtitle="Electricity bill, ownership and roof" icon={<Sun className="h-4 w-4" />} />
          <div className="space-y-4 p-5">
            <BillReader
              onExtract={(b) =>
                setF((x) => ({
                  ...x,
                  monthlyBill: b.monthlyBill ?? x.monthlyBill,
                  monthlyUnits: b.monthlyUnits ?? x.monthlyUnits,
                  discom: b.discom ?? x.discom,
                  consumerNumber: b.consumerNumber ?? x.consumerNumber,
                  sanctionedLoadKw: b.sanctionedLoadKw ?? x.sanctionedLoadKw,
                  phase: b.phase ?? x.phase,
                  name: x.name || b.consumerName || "",
                  address: x.address || b.address || "",
                }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Monthly EB bill">
                <NumberInput prefix="₹" value={f.monthlyBill} onChange={(v) => set("monthlyBill", v)} placeholder="2500" />
              </Field>
              <Field label="Monthly units" hint="Optional — more accurate than bill">
                <NumberInput suffix="kWh" value={f.monthlyUnits} onChange={(v) => set("monthlyUnits", v)} />
              </Field>
              <Field label="Sanctioned load">
                <NumberInput suffix="kW" value={f.sanctionedLoadKw} onChange={(v) => set("sanctionedLoadKw", v)} />
              </Field>
              <Field label="DISCOM">
                <input className="input" value={f.discom} onChange={(e) => set("discom", e.target.value)} placeholder="e.g. TNPDCL" />
              </Field>
              <Field label="Consumer number">
                <input className="input" value={f.consumerNumber} onChange={(e) => set("consumerNumber", e.target.value)} />
              </Field>
              <Field label="Connection">
                <Segmented value={f.phase} onChange={(v) => set("phase", v)} options={[{ value: "SINGLE", label: "Single phase" }, { value: "THREE", label: "Three phase" }]} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Owns the property?">
                <YesNo value={f.ownsProperty} onChange={(v) => set("ownsProperty", v)} />
              </Field>
              <Field label="Shadow-free roof?">
                <YesNo value={f.shadowFree} onChange={(v) => set("shadowFree", v)} />
              </Field>
              <Field label="Usable roof area">
                <NumberInput suffix="sq.ft" value={f.roofAreaSqft} onChange={(v) => set("roofAreaSqft", v)} />
              </Field>
            </div>
            <Field label="Roof type">
              <Segmented value={f.roofType} onChange={(v) => set("roofType", v)} options={ROOF_TYPES.map((r) => ({ value: r, label: r === "RCC" ? "RCC / Concrete" : humanize(r) }))} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Instant estimate</h3>
            <span
              className={`chip ${basic.status === "QUALIFIED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : basic.status === "DISQUALIFIED" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
            >
              {basic.status === "QUALIFIED" ? "✓ Qualifies" : basic.status === "DISQUALIFIED" ? "✗ Does not qualify" : "Needs info"}
            </span>
          </div>
          {basic.reasons.map((r) => (
            <p key={r} className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {r}
            </p>
          ))}
          {sizing ? (
            <SolarEstimate r={sizing} loan={loan} dense />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Enter the monthly bill or units to see system size, subsidy, savings and EMI instantly.</div>
          )}
        </Card>
        <Button variant="primary" size="lg" className="w-full" loading={saving}>
          Create lead
        </Button>
        <p className="text-center text-xs text-slate-500">Automations will score, assign and send a WhatsApp welcome.</p>
      </div>
    </form>
  );
}
