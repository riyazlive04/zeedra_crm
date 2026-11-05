"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Minus, Plus, RotateCcw, RectangleVertical, RectangleHorizontal } from "lucide-react";

/** Module sizes offered in the proposal layout (typical datasheet dimensions, mm). */
export const PANEL_SIZES = [
  { id: "335", label: "335 Wp poly (1956 × 992 mm)", watt: 335, length: 1956, width: 992 },
  { id: "400", label: "400 Wp mono (2015 × 996 mm)", watt: 400, length: 2015, width: 996 },
  { id: "445", label: "445 Wp mono (2094 × 1038 mm)", watt: 445, length: 2094, width: 1038 },
  { id: "540", label: "540 Wp mono half-cut (2278 × 1134 mm)", watt: 540, length: 2278, width: 1134 },
  { id: "550", label: "550 Wp bifacial (2278 × 1134 mm)", watt: 550, length: 2278, width: 1134 },
  { id: "580", label: "580 Wp TOPCon (2278 × 1134 mm)", watt: 580, length: 2278, width: 1134 },
] as const;

export interface PanelLayoutState {
  sizeId: string; // a PANEL_SIZES id or "custom"
  watt: number;
  length: number; // mm
  width: number; // mm
  orientation: "portrait" | "landscape";
  cols: number;
  /** Slot index of each panel (row-major); empty = default packing. */
  positions: number[];
}

const COL_GAP_M = 0.02;
const ROW_GAP_M = 0.5; // walkway / inter-row spacing on a flat roof

function defaults(defaultWatt: number): PanelLayoutState {
  const preset = PANEL_SIZES.find((p) => p.watt === defaultWatt);
  return {
    sizeId: preset?.id ?? "custom",
    watt: defaultWatt,
    length: preset?.length ?? 2278,
    width: preset?.width ?? 1134,
    orientation: "portrait",
    cols: 0,
    positions: [],
  };
}

/** Per-lead layout state, remembered in this browser. */
export function usePanelLayout(leadId: string, defaultWatt: number) {
  const key = `zeedra.panelLayout.${leadId}`;
  const [state, setState] = useState<PanelLayoutState>(() => defaults(defaultWatt));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState({ ...defaults(defaultWatt), ...JSON.parse(raw) });
    } catch {
      /* ignore corrupt storage */
    }
  }, [key, defaultWatt]);
  const update = (patch: Partial<PanelLayoutState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full / private mode */
      }
      return next;
    });
  const reset = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setState(defaults(defaultWatt));
  };
  return [state, update, reset] as const;
}

/** Same column heuristic as the static preview: arrays are usually wider than deep. */
const autoCols = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));

/** Valid, collision-free slot positions for `n` panels in a `cols`-wide grid. */
function normalise(positions: number[], n: number): number[] {
  const out: number[] = [];
  const used = new Set<number>();
  for (const p of positions.slice(0, n)) {
    if (Number.isInteger(p) && p >= 0 && !used.has(p)) {
      out.push(p);
      used.add(p);
    }
  }
  let next = 0;
  while (out.length < n) {
    while (used.has(next)) next++;
    out.push(next);
    used.add(next);
  }
  return out;
}

/** Interactive proposal layout: drag panels between slots, change module size, orientation and columns. */
export function PanelLayoutEditor({
  state, onChange, onReset, panelCount, systemKw, roofAreaSqft,
}: {
  state: PanelLayoutState;
  onChange: (p: Partial<PanelLayoutState>) => void;
  onReset: () => void;
  panelCount: number;
  systemKw: number;
  roofAreaSqft?: number | null;
}) {
  const cols = state.cols > 0 ? state.cols : autoCols(panelCount);
  const positions = useMemo(() => normalise(state.positions, panelCount), [state.positions, panelCount]);
  const maxPos = positions.length ? Math.max(...positions) : 0;
  // Always keep one spare row so panels have somewhere to move to.
  const rows = Math.max(1, Math.ceil((maxPos + 1) / cols)) + 1;
  const slotOf = new Map(positions.map((s, i) => [s, i]));
  const [dragFrom, setDragFrom] = useState<number | null>(null); // slot index
  const [picked, setPicked] = useState<number | null>(null); // tap-to-move (touch)
  const [over, setOver] = useState<number | null>(null);

  const portrait = state.orientation === "portrait";
  const pw = (portrait ? state.width : state.length) / 1000; // across the row, m
  const pd = (portrait ? state.length : state.width) / 1000; // depth, m

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...positions];
    const a = slotOf.get(from);
    const b = slotOf.get(to);
    if (a === undefined) return;
    next[a] = to;
    if (b !== undefined) next[b] = from; // dropping on a panel swaps them
    onChange({ positions: next, cols });
  };

  // Footprint of the occupied area (bounding box of used rows/cols).
  const usedCols = new Set(positions.map((p) => p % cols));
  const usedRows = new Set(positions.map((p) => Math.floor(p / cols)));
  const spanC = usedCols.size ? Math.max(...usedCols) - Math.min(...usedCols) + 1 : 0;
  const spanR = usedRows.size ? Math.max(...usedRows) - Math.min(...usedRows) + 1 : 0;
  const footW = spanC * pw + Math.max(0, spanC - 1) * COL_GAP_M;
  const footD = spanR * pd + Math.max(0, spanR - 1) * ROW_GAP_M;
  const footSqft = footW * footD * 10.7639;

  const setSize = (id: string) => {
    const p = PANEL_SIZES.find((x) => x.id === id);
    if (p) onChange({ sizeId: p.id, watt: p.watt, length: p.length, width: p.width, positions: [] });
    else onChange({ sizeId: "custom" });
  };
  const setCols = (c: number) => onChange({ cols: Math.max(1, Math.min(20, c)), positions: [] });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Panel size
          <select value={state.sizeId} onChange={(e) => setSize(e.target.value)} className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            {PANEL_SIZES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {state.sizeId === "custom" && (
          <div className="flex items-end gap-2">
            {([["watt", "Wp", 100, 800], ["length", "Length mm", 1000, 2600], ["width", "Width mm", 600, 1400]] as const).map(([k, l, min, max]) => (
              <label key={k} className="text-xs font-medium text-slate-600">
                {l}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={state[k]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= min && v <= max) onChange({ [k]: v, positions: [] } as Partial<PanelLayoutState>);
                  }}
                  className="mt-1 block h-9 w-24 rounded-lg border border-slate-200 px-2 text-sm"
                />
              </label>
            ))}
          </div>
        )}
        <div className="text-xs font-medium text-slate-600">
          Orientation
          <div className="mt-1 flex rounded-lg border border-slate-200 p-0.5">
            {(["portrait", "landscape"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => onChange({ orientation: o })}
                className={clsx("flex h-7 items-center gap-1 rounded-md px-2 text-xs capitalize", state.orientation === o ? "bg-sun-500 text-white" : "text-slate-600 hover:bg-slate-50")}
              >
                {o === "portrait" ? <RectangleVertical className="h-3.5 w-3.5" /> : <RectangleHorizontal className="h-3.5 w-3.5" />}
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs font-medium text-slate-600">
          Columns
          <div className="mt-1 flex h-9 items-center rounded-lg border border-slate-200">
            <button type="button" onClick={() => setCols(cols - 1)} className="grid h-full w-8 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Fewer columns"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-7 text-center text-sm tabular-nums">{cols}</span>
            <button type="button" onClick={() => setCols(cols + 1)} className="grid h-full w-8 place-items-center text-slate-500 hover:bg-slate-50" aria-label="More columns"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <button type="button" onClick={onReset} className="ml-auto flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-50" title="Reset layout">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div
        className="mx-auto grid gap-1.5 rounded-xl bg-slate-100 p-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: Math.min(640, cols * (portrait ? 64 : 110)) }}
      >
        {Array.from({ length: rows * cols }, (_, slot) => {
          const filled = slotOf.has(slot);
          const isPicked = picked === slot;
          return (
            <div
              key={slot}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(slot);
              }}
              onDragLeave={() => setOver((o) => (o === slot ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, slot);
                setDragFrom(null);
                setOver(null);
              }}
              onClick={() => {
                if (picked !== null) {
                  move(picked, slot);
                  setPicked(null);
                } else if (filled) setPicked(slot);
              }}
              className={clsx("relative rounded-[3px]", over === slot && dragFrom !== null && "ring-2 ring-sun-500")}
              style={{ aspectRatio: `${pw} / ${pd}` }}
            >
              {filled ? (
                <div
                  draggable
                  onDragStart={(e) => {
                    setDragFrom(slot);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setOver(null);
                  }}
                  title="Drag to move · drop on another panel to swap"
                  className={clsx(
                    "pv-module h-full w-full cursor-grab rounded-[3px] active:cursor-grabbing",
                    portrait ? "pv-portrait" : "pv-landscape",
                    dragFrom === slot && "opacity-40",
                    isPicked && "ring-2 ring-sun-500 ring-offset-1",
                  )}
                />
              ) : (
                <div className={clsx("h-full w-full rounded-[3px] border border-dashed", picked !== null ? "border-sun-400 bg-sun-50/60" : "border-slate-300")} />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-500">
        {panelCount} panel{panelCount === 1 ? "" : "s"} × {state.watt} Wp = {systemKw} kWp · array ≈ {footW.toFixed(1)} m × {footD.toFixed(1)} m ({Math.round(footSqft)} sq.ft)
        {roofAreaSqft ? (
          <span className={footSqft > roofAreaSqft ? " font-medium text-rose-600" : ""}> · roof {Math.round(roofAreaSqft)} sq.ft{footSqft > roofAreaSqft ? " · doesn't fit" : ""}</span>
        ) : null}
      </p>
      <p className="text-center text-[11px] text-slate-400">Drag panels to rearrange (tap a panel, then a slot, on phones). This is a rough guide. Use Roof design for a measured layout and shading.</p>
    </div>
  );
}
