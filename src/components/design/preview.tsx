"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Share2, Zap, Sun } from "lucide-react";
import { buildScene, type DesignData } from "@/lib/solar/shading";
import { SunControls, type When } from "./sun-controls";

const View3D = dynamic(() => import("./view3d"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-800" /> });

export function DesignPreview({ data, title, customer, org, stats, embed, fullUrl }: {
  data: DesignData;
  title: string;
  customer: { name: string; code: string; segment: string; address: string | null } | null;
  org: { name: string; logoUrl: string | null; phone: string | null };
  stats: { systemKw: number; panelCount: number; shadingLossPct: number | null; annualKwh: number | null };
  /** Compact view for embedding inside a proposal: just the spinning 3D model. */
  embed?: boolean;
  fullUrl?: string;
}) {
  const scene = useMemo(() => buildScene(data), [data]);
  const colors = useMemo(() => scene.panels.map(() => null), [scene]);
  const [when, setWhen] = useState<When>({ month: 5, day: 21, hour: 12 });
  const [showPath, setShowPath] = useState(true);
  const [panelInfo, setPanelInfo] = useState(true);
  const [bearing, setBearing] = useState(0);
  const [resetNorth, setResetNorth] = useState(0);
  const [spin, setSpin] = useState(!!embed);

  if (embed) {
    return (
      <div className="relative h-screen w-full bg-slate-900">
        <View3D design={data} scene={scene} panelColors={colors} when={when} showSunPath={false} showPanelInfo autoRotate={spin} onBearing={setBearing} resetNorth={resetNorth} />
        <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
          <div className="font-semibold text-slate-800">{stats.systemKw.toFixed(2)} kW · {stats.panelCount} panels</div>
          {stats.annualKwh ? <div className="text-slate-500">≈ {Math.round(stats.annualKwh).toLocaleString("en-IN")} kWh a year</div> : null}
        </div>
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button onClick={() => setSpin(!spin)} className="rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow">{spin ? "Stop spinning" : "360° spin"}</button>
          {fullUrl && <a href={fullUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow">Open full view ↗</a>}
        </div>
        <p className="absolute bottom-3 left-3 text-[11px] text-white/80">Drag to rotate · scroll to zoom</p>
      </div>
    );
  }

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title, url }).catch(() => {});
    else await navigator.clipboard.writeText(url);
  };

  return (
    <div className="flex h-screen flex-col bg-white text-slate-800">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
        {org.logoUrl ? <img src={org.logoUrl} alt="" className="h-7 w-auto" /> : <Sun className="h-6 w-6 text-amber-500" />}
        <div className="h-6 w-px bg-slate-200" />
        <h1 className="truncate font-semibold text-teal-700">{title}</h1>
        <button onClick={share} className="ml-auto rounded-md p-1.5 text-teal-700 hover:bg-teal-50" aria-label="Share"><Share2 className="h-4 w-4" /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-slate-200 p-5 md:max-h-none md:w-[320px] md:border-b-0 md:border-r">
          {customer && <h2 className="text-2xl font-semibold">{customer.name}</h2>}
          <div className="mt-1 flex items-center gap-2 text-lg font-semibold"><Zap className="h-5 w-5 text-teal-600" /> {stats.systemKw.toFixed(2)} kW</div>
          {customer && (
            <p className="mt-2 text-sm italic text-slate-500">
              {customer.code} ({customer.segment.charAt(0) + customer.segment.slice(1).toLowerCase().replace(/_/g, " ")})
              {customer.address && <><br />{customer.address}</>}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Modules</div><div className="font-semibold">{stats.panelCount}</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Est. yearly energy</div><div className="font-semibold">{stats.annualKwh ? `${Math.round(stats.annualKwh).toLocaleString("en-IN")} kWh` : "-"}</div></div>
            {stats.shadingLossPct != null && <div className="col-span-2 rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Shading loss (annual)</div><div className="font-semibold">{stats.shadingLossPct.toFixed(1)}%</div></div>}
          </div>
          <h3 className="mb-3 mt-6 text-lg font-semibold">Sun path</h3>
          <SunControls when={when} onChange={setWhen} lat={data.center.lat} lng={data.center.lng} compact />
          <h3 className="mb-2 mt-6 text-lg font-semibold">Preview Settings</h3>
          <Toggle label="Panel Info" on={panelInfo} onChange={setPanelInfo} />
          <Toggle label="Sun path" on={showPath} onChange={setShowPath} />
          <Toggle label="360° spin" on={spin} onChange={setSpin} />
          <p className="mt-6 text-xs text-slate-400">Designed by {org.name}{org.phone ? ` · ${org.phone}` : ""}. Drag to rotate, scroll to zoom.</p>
        </aside>
        <main className="relative min-h-0 flex-1 bg-slate-900">
          <View3D design={data} scene={scene} panelColors={colors} when={when} showSunPath={showPath} showPanelInfo={panelInfo} autoRotate={spin} onBearing={setBearing} resetNorth={resetNorth} />
          <button onClick={() => setResetNorth((n) => n + 1)} title="Reset to north" className="absolute right-3 top-3 grid h-14 w-14 place-items-center rounded-full border-2 border-white/80 bg-slate-900/80 shadow-lg">
            <svg viewBox="0 0 56 56" className="h-12 w-12" style={{ transform: `rotate(${-bearing}deg)` }}>
              <text x="28" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="#f87171">N</text>
              <text x="47" y="31" textAnchor="middle" fontSize="7" fill="#fff">E</text>
              <text x="28" y="47" textAnchor="middle" fontSize="7" fill="#fff">S</text>
              <text x="9" y="31" textAnchor="middle" fontSize="7" fill="#fff">W</text>
              <path d="M28 18 L31 28 L28 26 L25 28 Z" fill="#f87171" /><path d="M28 38 L31 28 L28 30 L25 28 Z" fill="#fff" />
            </svg>
          </button>
          <div className="absolute bottom-3 right-3 rounded-lg bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow">Made with <b className="text-slate-800">{org.name}</b></div>
        </main>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-sm">
      {label}
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-teal-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
