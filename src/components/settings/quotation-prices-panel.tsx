"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import { Button, Card, CardHeader, Field } from "../ui";
import { YesNo } from "../form-controls";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import type { OrgSettings } from "@/lib/settings";
import {
  DCR_PRICE_WATTS,
  INVERTER_BRANDS,
  NDCR_PRICE_WATTS,
  PANEL_BRANDS,
  QUOTIFY_DEFAULTS,
  resolvePrices,
  wattOptions,
  type PanelTech,
  type QuotifyCustomRows,
} from "@/lib/solar/quotify";

type Prices = Record<string, string>;
type Row2 = { a: string; b: string };
type CompRow = { name: string; price: string; perKw: boolean };

const BRAND_SELECTS: Record<string, string[]> = {
  brand_dcr_panel: PANEL_BRANDS.dcr,
  brand_ndcr_panel: PANEL_BRANDS.ndcr,
  brand_ongrid_inv: INVERTER_BRANDS.ongrid,
  brand_hybrid_inv: INVERTER_BRANDS.hybrid,
  brand_micro_inv: INVERTER_BRANDS.micro,
};

function toStrings(P: Record<string, number | string>): Prices {
  const out: Prices = {};
  for (const [k, v] of Object.entries(P)) out[k] = String(v);
  return out;
}

function PriceRow({ label, unit, value, onChange, min, max, step }: { label: string; unit?: string; value: string; onChange: (v: string) => void; min?: number; max?: number; step?: number }) {
  const n = Number(value);
  const invalid = value !== "" && ((min !== undefined && n < min) || (max !== undefined && n > max));
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 last:border-0">
      <span className="flex-1 text-sm text-slate-700">{label}</span>
      {unit && <span className="text-xs text-slate-400">{unit}</span>}
      <div className="w-28">
        <input type="number" className={clsx("input text-right font-semibold", invalid && "border-rose-400 ring-1 ring-rose-300")} value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value)} />
        {invalid && <div className="mt-0.5 text-right text-[10px] text-rose-600">{min}–{max}</div>}
      </div>
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <div className="bg-slate-50 px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">{children}</div>;
}

function Collapsible({ title, hint, pill, count, children, defaultOpen = false }: { title: string; hint?: string; pill?: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
        {pill && <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", pill === "DCR" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800")}>{pill}</span>}
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-800">{title}</span>
          {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
        </span>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{count}</span>}
        <ChevronRight className={clsx("h-4 w-4 text-slate-400 transition", open && "rotate-90")} />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div className="px-5 py-2">
      <button type="button" onClick={onClick} className="w-full rounded-lg border border-dashed border-sky-300 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50">
        <Plus className="mr-1 inline h-3 w-3" />
        {children}
      </button>
    </div>
  );
}

function CustomRows({ rows, setRows, aLabel, bLabel, aStep, bStep }: { rows: Row2[]; setRows: (r: Row2[]) => void; aLabel: string; bLabel: string; aStep: number; bStep: number }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-5 py-1.5">
          <input type="number" className="input w-24" placeholder={aLabel} step={aStep} value={r.a} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
          <span className="ml-auto text-xs text-slate-400">{bLabel}</span>
          <input type="number" className="input w-28" placeholder="Price" step={bStep} value={r.b} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="Remove row">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </>
  );
}

function BrandPick({ label, brands, value, onChange }: { label: string; brands: string[]; value: string; onChange: (v: string) => void }) {
  const match = brands.find((b) => b.toLowerCase() === value.toLowerCase());
  const [custom, setCustom] = useState(!match && Boolean(value));
  return (
    <div className="border-b border-slate-100 px-5 py-2.5">
      <div className="mb-1 text-sm text-slate-700">{label}</div>
      <select
        className="input"
        value={custom ? "others" : (match ?? brands[0])}
        onChange={(e) => {
          if (e.target.value === "others") {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        {brands.map((b) => (
          <option key={b}>{b}</option>
        ))}
        <option value="others">Others…</option>
      </select>
      {custom && <input className="input mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter brand name" />}
    </div>
  );
}

export function QuotationPricesPanel({ settings }: { settings: OrgSettings }) {
  const router = useRouter();
  const toast = useToast();
  const q = settings.quotation;
  const initialCustom = q.custom as QuotifyCustomRows;
  const [p, setP] = useState<Prices>(() => toStrings(resolvePrices(q.prices, { ...initialCustom, panel_dcr: [], panel_ndcr: [] })));
  const [defaultPanelType, setDefaultPanelType] = useState<PanelTech>(q.defaultPanelType);
  const toRows = (r: { kw?: number; w?: number; price?: number; perW?: number }[]) => r.map((x) => ({ a: String(x.kw ?? x.w ?? ""), b: String(x.price ?? x.perW ?? "") }));
  const [inv1, setInv1] = useState<Row2[]>(toRows(initialCustom.inv_1ph));
  const [inv3, setInv3] = useState<Row2[]>(toRows(initialCustom.inv_3ph));
  const [invH, setInvH] = useState<Row2[]>(toRows(initialCustom.inv_hyb));
  const [pDcr, setPDcr] = useState<Row2[]>(toRows(initialCustom.panel_dcr));
  const [pNdcr, setPNdcr] = useState<Row2[]>(toRows(initialCustom.panel_ndcr));
  const [comps, setComps] = useState<CompRow[]>(initialCustom.components.map((c) => ({ name: c.name, price: String(c.price), perKw: c.perKw })));
  const [stages, setStages] = useState(q.paymentStages.map((s) => ({ ...s, pct: String(s.pct) })));
  const [stateSubsidy, setStateSubsidy] = useState(q.stateSubsidy);
  const [bank, setBank] = useState(q.bank);
  const [signatoryName, setSignatoryName] = useState(q.signatoryName);
  const [footerLine, setFooterLine] = useState(q.footerLine);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const set = (k: string) => (v: string) => setP((x) => ({ ...x, [k]: v }));
  const row = (key: string, label: string, unit?: string, step = 100, min?: number, max?: number) => <PriceRow key={key} label={label} unit={unit} value={p[key] ?? ""} onChange={set(key)} step={step} min={min} max={max} />;

  const customNow: QuotifyCustomRows = {
    inv_1ph: inv1.filter((r) => +r.a > 0 && +r.b > 0).map((r) => ({ kw: +r.a, price: +r.b })),
    inv_3ph: inv3.filter((r) => +r.a > 0 && +r.b > 0).map((r) => ({ kw: +r.a, price: +r.b })),
    inv_hyb: invH.filter((r) => +r.a > 0 && +r.b > 0).map((r) => ({ kw: +r.a, price: +r.b })),
    panel_dcr: pDcr.filter((r) => +r.a > 0 && +r.b > 0).map((r) => ({ w: +r.a, perW: +r.b })),
    panel_ndcr: pNdcr.filter((r) => +r.a > 0 && +r.b > 0).map((r) => ({ w: +r.a, perW: +r.b })),
    components: comps.filter((c) => c.name.trim() && +c.price > 0).map((c) => ({ name: c.name.trim(), price: +c.price, perKw: c.perKw })),
  };
  const stageTotal = stages.reduce((sum, s) => sum + (Number(s.pct) || 0), 0);

  const wattSelect = (key: string, type: PanelTech, label: string) => {
    const opts = wattOptions(type, customNow);
    const cur = Number(p[key]);
    return (
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5">
        <span className="flex-1 text-sm text-slate-700">{label}</span>
        <span className="text-xs text-slate-400">W</span>
        <select className="input w-28" value={opts.includes(cur) ? String(cur) : ""} onChange={(e) => set(key)(e.target.value)}>
          {!opts.includes(cur) && <option value="" />}
          {opts.map((w) => (
            <option key={w} value={w}>
              {w}W
            </option>
          ))}
        </select>
      </div>
    );
  };

  async function save() {
    // Panel ₹/W grids carry sanity ranges, as on the quotation form's Settings.
    const bad =
      DCR_PRICE_WATTS.some((w) => p["dcr_pw_" + w] !== "" && (+p["dcr_pw_" + w] < 21 || +p["dcr_pw_" + w] > 35)) ||
      NDCR_PRICE_WATTS.some((w) => p["ndcr_pw_" + w] !== "" && (+p["ndcr_pw_" + w] < 15 || +p["ndcr_pw_" + w] > 25));
    if (bad) return toast.error("Some panel prices are out of range", "DCR ₹21–35/W, NDCR ₹15–25/W.");
    if (Math.abs(stageTotal - 100) > 0.001) return toast.error("Payment stages must add up to 100%", `They add up to ${stageTotal}% now.`);
    const prices: Record<string, number | string> = {};
    for (const key of Object.keys(QUOTIFY_DEFAULTS) as (keyof typeof QUOTIFY_DEFAULTS)[]) {
      const def = QUOTIFY_DEFAULTS[key];
      const raw = (p[key] ?? "").trim();
      prices[key] = typeof def === "string" ? raw || def : parseFloat(raw) || def;
    }
    setBusy(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: {
          settings: {
            quotation: {
              prices,
              custom: customNow,
              defaultPanelType,
              stateSubsidy,
              paymentStages: stages.map((s) => ({ name: s.name.trim(), pct: Number(s.pct) || 0, when: s.when.trim() })).filter((s) => s.name),
              bank: { name: bank.name.trim(), branch: bank.branch.trim(), accNo: bank.accNo.trim(), ifsc: bank.ifsc.trim() },
              signatoryName: signatoryName.trim(),
              footerLine: footerLine.trim(),
            },
          },
        },
      });
      toast.success("Settings Saved!");
      router.refresh();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  function resetDefaults() {
    if (!confirm("Reset all prices to factory defaults?")) return;
    setP(toStrings(resolvePrices({}, { inv_1ph: [], inv_3ph: [], inv_hyb: [], panel_dcr: [], panel_ndcr: [], components: [] })));
    setInv1([]);
    setInv3([]);
    setInvH([]);
    setPDcr([]);
    setPNdcr([]);
    setComps([]);
    setDefaultPanelType("bifacial");
    setResetKey((k) => k + 1);
    toast.info("Reset to Defaults — press Save to apply.");
  }

  return (
    <div className="space-y-4" key={resetKey}>
      <Card>
        <CardHeader title="General" subtitle="Saved for the whole team. Only admins can change prices." />
        {row("margin", "Margin %", "%", 0.5)}
        {row("peak_sun", "Peak Sun Hours", "hrs", 0.1)}
        {row("efficiency", "Panel Efficiency Factor", "%", 1)}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5">
          <span className="flex-1 text-sm text-slate-700">Default Panel Technology</span>
          <select className="input w-32" value={defaultPanelType} onChange={(e) => setDefaultPanelType(e.target.value as PanelTech)}>
            <option value="bifacial">Bifacial</option>
            <option value="topcon">TOPCon</option>
            <option value="hjt">HJT</option>
          </select>
        </div>
        {wattSelect("dcr_panel_w", "bifacial", "Bifacial Default Wattage")}
        {wattSelect("topcon_panel_w", "topcon", "TOPCon Default Wattage")}
        {wattSelect("hjt_panel_w", "hjt", "HJT Default Wattage")}
      </Card>

      <Card>
        <div className="bg-ink-950 px-5 py-3 text-white">
          <div className="font-display text-base font-bold">System Prices</div>
          <div className="text-[11px] text-slate-400">DCR &amp; NDCR · Panel Rates &amp; BOS Costs</div>
        </div>
        <Collapsible title="Panel Prices" hint="Made in India · Subsidy eligible · ₹/W" pill="DCR" count={DCR_PRICE_WATTS.length}>
          <div className="grid grid-cols-2 gap-2 px-5 py-2 sm:grid-cols-4">
            {DCR_PRICE_WATTS.map((w) => {
              const v = p["dcr_pw_" + w] ?? "";
              const bad = v !== "" && (+v < 21 || +v > 35);
              return (
                <label key={w} className="text-[11px] font-semibold text-slate-500">
                  {w}W
                  <input type="number" min={21} max={35} step={0.5} className={clsx("input mt-0.5 text-center font-semibold", bad && "border-rose-400")} value={v} onChange={(e) => set("dcr_pw_" + w)(e.target.value)} />
                </label>
              );
            })}
          </div>
          <CustomRows rows={pDcr} setRows={setPDcr} aLabel="Watt" bLabel="₹/W" aStep={5} bStep={0.5} />
          <AddButton onClick={() => setPDcr([...pDcr, { a: "", b: "" }])}>Add wattage &amp; price</AddButton>
        </Collapsible>
        <Collapsible title="Panel Prices" hint="Imported · No subsidy · ₹/W" pill="NDCR" count={NDCR_PRICE_WATTS.length}>
          <div className="grid grid-cols-2 gap-2 px-5 py-2 sm:grid-cols-4">
            {NDCR_PRICE_WATTS.map((w) => {
              const v = p["ndcr_pw_" + w] ?? "";
              const bad = v !== "" && (+v < 15 || +v > 25);
              return (
                <label key={w} className="text-[11px] font-semibold text-slate-500">
                  {w}W
                  <input type="number" min={15} max={25} step={0.5} className={clsx("input mt-0.5 text-center font-semibold", bad && "border-rose-400")} value={v} onChange={(e) => set("ndcr_pw_" + w)(e.target.value)} />
                </label>
              );
            })}
          </div>
          <CustomRows rows={pNdcr} setRows={setPNdcr} aLabel="Watt" bLabel="₹/W" aStep={5} bStep={0.5} />
          <AddButton onClick={() => setPNdcr([...pNdcr, { a: "", b: "" }])}>Add wattage &amp; price</AddButton>
        </Collapsible>
        <div className="flex items-center justify-between bg-slate-50 px-5 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Common Costs</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">DCR &amp; NDCR</span>
        </div>
        {row("dcr_struct", "Mounting Structure", "₹/kW")}
        {row("dcr_dcdb", "DCDB", "₹")}
        {row("dcr_acdb", "ACDB", "₹")}
        {row("dcr_dccable", "DC Cable", "₹")}
        {row("dcr_accable", "Copper Cable", "₹")}
        {row("dcr_misc", "Miscellaneous", "₹")}
        {row("install", "Installation", "₹/kW")}
        {row("transport", "Transport", "₹/kW")}
      </Card>

      <Card>
        <CardHeader title="On-Grid Inverter Prices" />
        <Sub>Single Phase</Sub>
        {row("inv_3k", "3kW 1Ph", "₹", 500)}
        {row("inv_4k", "4kW 1Ph", "₹", 500)}
        {row("inv_5k", "5kW 1Ph", "₹", 500)}
        <CustomRows rows={inv1} setRows={setInv1} aLabel="kW" bLabel="₹" aStep={0.1} bStep={500} />
        <AddButton onClick={() => setInv1([...inv1, { a: "", b: "" }])}>Add 1Ph size &amp; price</AddButton>
        <Sub>Three Phase</Sub>
        {row("inv3ph_4k", "4kW 3Ph", "₹", 500)}
        {row("inv3ph_5k", "5kW 3Ph", "₹", 500)}
        {row("inv3ph_6k", "6kW 3Ph", "₹", 500)}
        {row("inv3ph_8k", "8kW 3Ph", "₹", 500)}
        {row("inv3ph_10k", "10kW 3Ph", "₹", 500)}
        <CustomRows rows={inv3} setRows={setInv3} aLabel="kW" bLabel="₹" aStep={0.1} bStep={500} />
        <AddButton onClick={() => setInv3([...inv3, { a: "", b: "" }])}>Add 3Ph size &amp; price</AddButton>
      </Card>

      <Card>
        <Collapsible title="Hybrid Prices">
          <Sub>Inverter</Sub>
          {row("hinv_3k", "3kW Hybrid (Deye)", "₹", 500)}
          {row("hinv_5k", "5kW Hybrid (Deye)", "₹", 500)}
          {row("hinv_10k", "10kW Hybrid (Deye)", "₹", 500)}
          <CustomRows rows={invH} setRows={setInvH} aLabel="kW" bLabel="₹" aStep={0.1} bStep={500} />
          <AddButton onClick={() => setInvH([...invH, { a: "", b: "" }])}>Add hybrid size &amp; price</AddButton>
          <Sub>System Components</Sub>
          {row("battery", "Battery G5.3", "₹", 1000)}
          {row("hyb_changeover", "Changeover & Input MCB", "₹", 50)}
          {row("hyb_batt_switch", "Battery Disconnect Switch", "₹", 50)}
          {row("hyb_batt_rack", "Battery Rack", "₹")}
          {row("hyb_epwr", "EPWR / ECOM Cable", "₹")}
          {row("hyb_batt_cable", "Battery Cable Copper", "₹")}
          {row("hyb_dc_cable", "DC Cable", "₹")}
          {row("hyb_misc", "Miscellaneous", "₹/kW", 50)}
          {row("hyb_install", "Installation", "₹/kW")}
          {row("hyb_transport", "Transport", "₹/kW")}
        </Collapsible>
      </Card>

      <Card>
        <CardHeader title="Common Components" />
        {row("lightning", "Lightning Arrestor", "₹")}
        {row("earth_kit", "Earthing Kit (per unit)", "₹")}
        {row("earth_cable", "Earth Cable (per metre)", "₹/m", 10)}
        {row("floor_cable", "Extra Cable per Floor", "m", 1)}
        {row("micro_inv", "Micro Inverter (per panel)", "₹", 500)}
        {comps.map((c, i) => (
          <div key={i} className="flex items-center gap-2 px-5 py-1.5">
            <input className="input flex-1" placeholder="Component name" value={c.name} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <select className="input w-20" value={c.perKw ? "perkw" : "flat"} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, perKw: e.target.value === "perkw" } : x)))}>
              <option value="flat">₹</option>
              <option value="perkw">₹/kW</option>
            </select>
            <input type="number" className="input w-24" placeholder="Price" step={100} value={c.price} onChange={(e) => setComps(comps.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            <button type="button" onClick={() => setComps(comps.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="Remove component">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <AddButton onClick={() => setComps([...comps, { name: "", price: "", perKw: false }])}>Add component (name, price)</AddButton>
      </Card>

      <Card>
        <Collapsible title="Brand Names">
          <BrandPick label="DCR Panel (Default)" brands={BRAND_SELECTS.brand_dcr_panel} value={p.brand_dcr_panel ?? ""} onChange={set("brand_dcr_panel")} />
          <BrandPick label="NDCR / Hybrid Panel (Default)" brands={BRAND_SELECTS.brand_ndcr_panel} value={p.brand_ndcr_panel ?? ""} onChange={set("brand_ndcr_panel")} />
          <BrandPick label="On-Grid Inverter (Default)" brands={BRAND_SELECTS.brand_ongrid_inv} value={p.brand_ongrid_inv ?? ""} onChange={set("brand_ongrid_inv")} />
          <BrandPick label="Hybrid Inverter (Default)" brands={BRAND_SELECTS.brand_hybrid_inv} value={p.brand_hybrid_inv ?? ""} onChange={set("brand_hybrid_inv")} />
          <BrandPick label="Micro Inverter (Default)" brands={BRAND_SELECTS.brand_micro_inv} value={p.brand_micro_inv ?? ""} onChange={set("brand_micro_inv")} />
          {(
            [
              ["brand_structure", "Mounting Structure"],
              ["brand_dcdb_acdb", "DCDB / ACDB"],
              ["brand_dc_cable", "DC Cable"],
              ["brand_ac_cable", "AC Copper Cable"],
              ["brand_earth_cable", "Earth / Battery Cable"],
              ["brand_conduit", "Flexible Conduit"],
              ["brand_battery", "Battery"],
              ["brand_mcb", "MCB / Changeover"],
              ["brand_lightning", "Lightning Arrestor"],
              ["brand_transport", "Transport"],
            ] as const
          ).map(([k, l]) => (
            <div key={k} className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 last:border-0">
              <span className="flex-1 text-sm text-slate-700">{l}</span>
              <input className="input w-44" value={p[k] ?? ""} onChange={(e) => set(k)(e.target.value)} />
            </div>
          ))}
        </Collapsible>
      </Card>

      <Card>
        <CardHeader title="Quotation terms page" subtitle={`Printed on page 4 of every quotation. Validity (${settings.quotationValidityDays} days) is set under Pricing & subsidy.`} />
        <div className="space-y-5 p-5">
          <div>
            <div className="label">Payment Terms</div>
            <p className="mb-2 text-xs text-slate-500">Percent of the total project cost. They must add up to 100%.</p>
            <div className="space-y-2">
              {stages.map((st, i) => (
                <div key={i} className="space-y-1.5 rounded-xl border border-slate-200 p-3">
                  <div className="flex gap-2">
                    <input className="input flex-1" placeholder="Stage name, e.g. Booking Advance" value={st.name} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <input type="number" className="input w-20" placeholder="%" value={st.pct} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
                    <button type="button" onClick={() => setStages(stages.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="Remove stage">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <input className="input" placeholder="When it is due (optional)" value={st.when} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button size="xs" onClick={() => setStages([...stages, { name: "", pct: "", when: "" }])}>
                <Plus className="h-3 w-3" /> Add stage
              </Button>
              <span className={clsx("text-xs font-semibold", Math.abs(stageTotal - 100) < 0.001 ? "text-emerald-700" : "text-rose-600")}>Total: {stageTotal}%</span>
            </div>
          </div>
          <Field label="Tamil Nadu state subsidy (G.O. 102)" hint="Adds ₹5,000 / ₹10,000 / ₹22,000 to DCR quotations">
            <YesNo value={stateSubsidy} onChange={(v) => setStateSubsidy(v ?? false)} yes="On" no="Off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank">
              <input className="input" value={bank.name} onChange={(e) => setBank({ ...bank, name: e.target.value })} />
            </Field>
            <Field label="Branch">
              <input className="input" value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} />
            </Field>
            <Field label="A/C No">
              <input className="input" value={bank.accNo} onChange={(e) => setBank({ ...bank, accNo: e.target.value })} />
            </Field>
            <Field label="IFSC">
              <input className="input" value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Managing Director name" hint="Signs the cover letter. Leave blank to sign with the company name.">
              <input className="input" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} />
            </Field>
            <Field label="Footer line" hint="Optional, under the company name on every page (e.g. branch offices)">
              <input className="input" value={footerLine} onChange={(e) => setFooterLine(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={resetDefaults}>
          <RotateCcw className="h-4 w-4" /> Reset to Defaults
        </Button>
        <Button variant="primary" loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
