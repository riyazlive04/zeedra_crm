"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { sunPath, sunPosition, siteDate } from "@/lib/solar/shading";
import { dateToDoy, doyToDate, fmtClock, MONTHS } from "./common";

export type When = { month: number; day: number; hour: number };

/** Date + time sliders with play, solstice shortcuts and a live sun readout. */
export function SunControls({ when, onChange, lat, lng, compact }: { when: When; onChange: (w: When) => void; lat: number; lng: number; compact?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef(when);
  ref.current = when;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const w = ref.current;
      const next = w.hour + 0.25 > 18.5 ? 6 : w.hour + 0.25;
      onChange({ ...w, hour: next });
    }, 160);
    return () => clearInterval(t);
  }, [playing, onChange]);
  const doy = dateToDoy(when.month, when.day);
  const sun = sunPosition(siteDate(2025, when.month, when.day, when.hour, lng), lat, lng);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-sm font-medium text-slate-700">Date: {MONTHS[when.month]} {when.day}</div>
        <input type="range" min={0} max={364} value={doy} onChange={(e) => onChange({ ...when, ...doyToDate(Number(e.target.value)) })} className="sun-range w-full" />
      </div>
      <div>
        <div className="mb-1 text-sm font-medium text-slate-700">Time: {fmtClock(when.hour)}</div>
        <div className="flex items-center gap-2">
          <input type="range" min={5} max={19} step={0.25} value={when.hour} onChange={(e) => onChange({ ...when, hour: Number(e.target.value) })} className="sun-range w-full" />
          <button type="button" onClick={() => setPlaying(!playing)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-600 text-white hover:bg-teal-700" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onChange({ month: 5, day: 21, hour: 12 })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">JUNE 21, 12PM</button>
        <button type="button" onClick={() => onChange({ month: 11, day: 21, hour: 12 })} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">DEC 21, 12PM</button>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>Sun azimuth <b className="text-slate-700">{sun.azimuth.toFixed(0)}°</b></span>
        <span>Elevation <b className="text-slate-700">{sun.elevation > 0 ? `${sun.elevation.toFixed(0)}°` : "below horizon"}</b></span>
      </div>
      {!compact && <SunPathDiagram lat={lat} lng={lng} when={when} />}
    </div>
  );
}

/** Polar sun-path chart: zenith at centre, horizon at the rim, north up. */
export function SunPathDiagram({ lat, lng, when, size = 200 }: { lat: number; lng: number; when: When; size?: number }) {
  const R = size / 2 - 14, c = size / 2;
  const xy = (az: number, el: number) => {
    const r = R * (1 - el / 90), a = (az * Math.PI) / 180;
    return [c + r * Math.sin(a), c - r * Math.cos(a)];
  };
  const path = (m: number, d: number) =>
    sunPath(lat, lng, 2025, m, d).map((s, i) => `${i ? "L" : "M"}${xy(s.azimuth, s.elevation).map((v) => v.toFixed(1)).join(",")}`).join("");
  const now = sunPosition(siteDate(2025, when.month, when.day, when.hour, lng), lat, lng);
  const [nx, ny] = xy(now.azimuth, Math.max(0, now.elevation));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[220px]">
      {[0, 30, 60].map((e) => <circle key={e} cx={c} cy={c} r={R * (1 - e / 90)} fill="none" stroke="#e2e8f0" />)}
      <line x1={c} y1={c - R} x2={c} y2={c + R} stroke="#e2e8f0" />
      <line x1={c - R} y1={c} x2={c + R} y2={c} stroke="#e2e8f0" />
      {(["N", "E", "S", "W"] as const).map((l, i) => {
        const [x, y] = xy(i * 90, -12);
        return <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight={700} fill={l === "N" ? "#dc2626" : "#64748b"}>{l}</text>;
      })}
      <path d={path(5, 21)} fill="none" stroke="#93c5fd" strokeWidth={1.5} />
      <path d={path(11, 21)} fill="none" stroke="#93c5fd" strokeWidth={1.5} />
      <path d={path(when.month, when.day)} fill="none" stroke="#f59e0b" strokeWidth={2} />
      {now.elevation > 0 && <circle cx={nx} cy={ny} r={6} fill="#fbbf24" stroke="#fff" strokeWidth={2} />}
    </svg>
  );
}
