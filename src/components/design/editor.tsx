"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft, Box, ChevronDown, Copy, Download, ExternalLink, Grid3x3, Map as MapIcon, MousePointer2, Pencil, Plane, Plus, Redo2,
  Save, Share2, Sun, Trash2, Undo2, X, Zap, Cable, LayoutGrid, HelpCircle, Check, AlertTriangle, Loader2, SquarePlus,
} from "lucide-react";
import {
  accessColor, annualAnalysis, buildScene, defaultZone, designSummary, instantShading, pointInPolygon, polygonArea, shadowPolygons, siteDate,
  effectiveZone, type AnalysisResult, type Blocker, type BlockerKind, type DesignData, type FreePanel, type LatLng, type Zone, type ZoneType,
} from "@/lib/solar/shading";
import {
  autoString, checkString, dcVoltageDrop, acVoltageDrop, findInverter, findModule, INVERTERS, MODULES, pickCable, stringLimits, suggestInverter,
  type InverterModel, type ModuleModel, type StringDef,
} from "@/lib/solar/equipment";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { panelId, wiringOrder, fmtLen, fmtArea, STRING_COLORS, uid, MONTHS, type Selection, type Tool } from "./common";
import { SunControls, type When } from "./sun-controls";
import type { TileSource } from "./map2d";

const Map2D = dynamic(() => import("./map2d"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-800" /> });
const View3D = dynamic(() => import("./view3d"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-800" /> });

export interface EditorInit {
  id: string;
  name: string;
  data: DesignData;
  lead: { id: string; name: string; code: string; address: string | null } | null;
  shareToken: string | null;
}

type Climate = { clearness: number[]; ghiMonthly: number[]; minC: number; maxC: number; source: string } | null;

const ZONE_TYPES: { type: ZoneType; label: string; hint: string }[] = [
  { type: "flat", label: "Flat / RCC", hint: "Concrete roof, modules on a tilted structure" },
  { type: "tilted", label: "Tilted Roof", hint: "Sloped roof, modules flush on the slope" },
  { type: "shed", label: "Shed", hint: "Elevated structure on legs, clear of parapets" },
];

function ZoneTypeIcon({ type }: { type: ZoneType }) {
  return (
    <svg viewBox="0 0 60 40" className="h-10 w-14">
      {type === "flat" && (<><path d="M8 16 L30 8 L52 16 L30 24 Z" fill="#f1f5f9" stroke="#334155" /><path d="M8 16 V32 L30 40 V24 M52 16 V32 L30 40" fill="#e2e8f0" stroke="#334155" /></>)}
      {type === "tilted" && (<><path d="M10 20 L30 6 L50 14 L30 28 Z" fill="#f1f5f9" stroke="#334155" /><path d="M10 20 V34 L30 40 V28 M50 14 V30 L30 40" fill="#e2e8f0" stroke="#334155" /></>)}
      {type === "shed" && (<><path d="M8 12 L32 6 L52 14 L28 20 Z" fill="#f8fafc" stroke="#334155" /><path d="M10 13 V36 M28 20 V40 M50 15 V34 M32 7 V28" stroke="#334155" /></>)}
    </svg>
  );
}

function NumField({ label, value, onChange, unit, step = 0.1, min, max, disabled }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number; max?: number; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-50"
          value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : ""}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        />
        {unit && <span className="w-6 text-xs text-slate-400">{unit}</span>}
      </span>
    </label>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" onMouseDown={onClose}>
      <div className={clsx("max-h-[85vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-md")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[calc(85vh-52px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function DesignEditor({ init, canEdit }: { init: EditorInit; canEdit: boolean }) {
  const toast = useToast();
  const [design, setDesign] = useState<DesignData>(init.data);
  const [past, setPast] = useState<DesignData[]>([]);
  const [future, setFuture] = useState<DesignData[]>([]);
  const [name, setName] = useState(init.name);
  const [tool, setTool] = useState<Tool>("select");
  const [pendingZoneType, setPendingZoneType] = useState<ZoneType>("flat");
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<"zones" | "layout" | "blockers">("zones");
  const [layoutSub, setLayoutSub] = useState<"inverter" | "wire">("inverter");
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [sunOpen, setSunOpen] = useState(false);
  const [heatmap, setHeatmap] = useState(false);
  const [when, setWhen] = useState<When>(() => ({ month: new Date().getMonth(), day: new Date().getDate(), hour: 12 }));
  const [analysis, setAnalysis] = useState<{ key: string; result: AnalysisResult } | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [climate, setClimate] = useState<Climate>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [tileSource, setTileSource] = useState<TileSource>("esri");
  const [labelSize, setLabelSize] = useState<"s" | "m" | "l">("m");
  const [bearing, setBearing] = useState(0);
  const [resetNorth, setResetNorth] = useState(0);
  const [fitKey, setFitKey] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; target: { type: "zone" | "blocker" | "panel"; id: string } } | null>(null);
  const [modal, setModal] = useState<null | "module" | "inverter" | "drone" | "help" | "share" | "results">(null);
  const [addMenu, setAddMenu] = useState<null | "zone" | "blocker">(null);
  const [activeString, setActiveString] = useState<string[] | null>(null);
  const [activeTarget, setActiveTarget] = useState({ inverterIndex: 0, mppt: 0 });
  const [shareToken, setShareToken] = useState(init.shareToken);
  const boundsGetter = useRef<(() => [LatLng, LatLng]) | null>(null);
  const units = design.units ?? "m";

  // ── History-aware updates
  const update = useCallback((fn: (d: DesignData) => DesignData, record = true) => {
    setDesign((d) => {
      const next = fn(d);
      if (next === d) return d;
      if (record) {
        setPast((p) => [...p.slice(-60), d]);
        setFuture([]);
      }
      return next;
    });
    setSaveState("dirty");
  }, []);
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [design, ...f]);
    setDesign(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSaveState("dirty");
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, design]);
    setDesign(future[0]);
    setFuture((f) => f.slice(1));
    setSaveState("dirty");
  };

  const scene = useMemo(() => buildScene(design), [design]);
  const summary = useMemo(() => designSummary(design, scene), [design, scene]);
  const geomKey = useMemo(() => JSON.stringify([design.zones, design.blockers, design.module, design.freePanels, design.performanceRatio, climate?.ghiMonthly]), [design.zones, design.blockers, design.module, design.freePanels, design.performanceRatio, climate]);
  const fresh = analysis && analysis.key === geomKey ? analysis.result : null;
  const customMods = design.customModules ?? [];
  const customInvs = design.customInverters ?? [];
  const moduleModel: ModuleModel =
    findModule(design.moduleId, customMods) ??
    ({ ...MODULES[0], id: "spec", brand: "", model: design.module.name, watt: design.module.watt, length: design.module.length * 1000, width: design.module.width * 1000 } as ModuleModel);
  const temps = design.temps ?? { minC: climate?.minC ?? 10, maxC: climate?.maxC ?? 40 };

  // ── Climate (NASA POWER) once per site
  useEffect(() => {
    api<NonNullable<Climate>>(`/api/designs/climate?lat=${design.center.lat}&lng=${design.center.lng}`)
      .then((c) => setClimate(c))
      .catch(() => setClimate(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design.center.lat.toFixed(2), design.center.lng.toFixed(2)]);

  // ── Annual analysis (heatmap) — deferred so the UI can paint the spinner first
  const runAnalysis = useCallback(() => {
    setAnalysing(true);
    setTimeout(() => {
      try {
        const result = annualAnalysis(design, scene, { monthlyGhi: climate?.ghiMonthly, monthlyClearness: climate?.clearness });
        setAnalysis({ key: geomKey, result });
      } finally {
        setAnalysing(false);
      }
    }, 30);
  }, [design, scene, climate, geomKey]);
  useEffect(() => {
    if (!heatmap || fresh || analysing || !scene.panels.length) return;
    const t = setTimeout(runAnalysis, 400);
    return () => clearTimeout(t);
  }, [heatmap, fresh, analysing, runAnalysis, scene.panels.length]);

  // ── Live shading
  const instant = useMemo(() => {
    if (!sunOpen && view !== "3d") return null;
    return instantShading(scene, siteDate(2025, when.month, when.day, when.hour, design.center.lng), design.center.lat, design.center.lng);
  }, [sunOpen, view, scene, when, design.center]);
  const shadows = useMemo(() => {
    if (!sunOpen || !instant || view !== "2d") return [];
    const heights = [...new Set(design.zones.map((z) => z.height))];
    return heights.flatMap((h) => shadowPolygons(scene, instant.sun, h).map((poly) => poly.map(scene.proj.toLatLng)));
  }, [sunOpen, instant, scene, design.zones, view]);

  const panelColors = useMemo(() => {
    if (heatmap && fresh) {
      const byIndex = new Map(fresh.panels.map((p) => [p.index, p.solarAccess]));
      return scene.panels.map((p) => (byIndex.has(p.index) ? accessColor(byIndex.get(p.index)!) : null));
    }
    if (sunOpen && instant) {
      return instant.panels.map((s) => (!s ? null : s.electricalLoss === 0 ? "#1d4ed8" : s.electricalLoss < 0.34 ? "#7c3aed" : s.electricalLoss < 0.67 ? "#9f1239" : "#334155"));
    }
    return scene.panels.map(() => null);
  }, [heatmap, fresh, sunOpen, instant, scene]);

  // ── Autosave
  const saveNow = useCallback(async () => {
    if (!canEdit) return;
    setSaveState("saving");
    try {
      await api(`/api/designs/${init.id}`, {
        method: "PATCH",
        body: {
          name,
          data: design,
          panelCount: summary.panelCount,
          systemKw: summary.systemKw,
          shadingLossPct: fresh ? Math.round(fresh.shadingLossPct * 100) / 100 : null,
          annualKwh: fresh ? Math.round(fresh.annualKwh) : null,
        },
      });
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      toast.error((e as Error).message);
    }
  }, [canEdit, init.id, name, design, summary, fresh, toast]);
  useEffect(() => {
    if (saveState !== "dirty" || !canEdit) return;
    const t = setTimeout(saveNow, 2000);
    return () => clearTimeout(t);
  }, [saveState, saveNow, canEdit]);
  useEffect(() => {
    if (fresh && canEdit) setSaveState((s) => (s === "saved" ? "dirty" : s));
  }, [fresh, canEdit]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  // ── Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); saveNow(); }
      else if ((k === "delete") && selection) deleteSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Mutations
  const patchZone = (id: string, patch: Partial<Zone>) => update((d) => ({ ...d, zones: d.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
  const patchBlocker = (id: string, patch: Partial<Blocker>) => update((d) => ({ ...d, blockers: d.blockers.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const deleteSelection = () => {
    if (!selection || !canEdit) return;
    if (selection.type === "zone") update((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== selection.id), strings: (d.strings ?? []).map((s) => ({ ...s, panels: s.panels.filter((p) => !p.startsWith(selection.id + "|")) })).filter((s) => s.panels.length) }));
    else update((d) => ({ ...d, blockers: d.blockers.filter((b) => b.id !== selection.id) }));
    setSelection(null);
  };
  const duplicate = (t: { type: "zone" | "blocker"; id: string }) => {
    const off = 0.00003;
    if (t.type === "zone") {
      const z = design.zones.find((x) => x.id === t.id);
      if (!z) return;
      const nz = { ...z, id: uid("z"), name: `Zone ${design.zones.length + 1}`, points: z.points.map((p) => ({ lat: p.lat - off, lng: p.lng + off })), removed: [] };
      update((d) => ({ ...d, zones: [...d.zones, nz] }));
      setSelection({ type: "zone", id: nz.id });
    } else {
      const b = design.blockers.find((x) => x.id === t.id);
      if (!b) return;
      const nb = { ...b, id: uid("b"), name: `${b.name} copy`, points: b.points.map((p) => ({ lat: p.lat - off, lng: p.lng + off })), center: b.center && { lat: b.center.lat - off, lng: b.center.lng + off } };
      update((d) => ({ ...d, blockers: [...d.blockers, nb] }));
      setSelection({ type: "blocker", id: nb.id });
    }
  };

  const onFinishShape = (t: Tool, pts: LatLng[]) => {
    if (t === "zone") {
      if (pts.length < 3) return;
      const n = design.zones.length + 1;
      let z = defaultZone(uid("z"), `Zone ${n}`, pts, design.center.lat);
      z = { ...z, type: pendingZoneType };
      if (pendingZoneType === "shed") z = { ...z, mountHeight: 2.4, tilt: 10, parapetHeight: 0.9 };
      if (pendingZoneType === "tilted") z = { ...z, parapetHeight: 0, orientation: "portrait" };
      // Shift the design origin to the first roof so local geometry stays centred.
      update((d) => ({ ...d, center: d.zones.length ? d.center : centroid(pts), zones: [...d.zones, z] }));
      setSelection({ type: "zone", id: z.id });
      setTab("zones");
    } else if (t === "rect" || t === "polygon" || t === "circle" || t === "tree") {
      const kind = t as BlockerKind;
      let b: Blocker;
      const n = design.blockers.length + 1;
      if (kind === "rect") {
        const [a, c] = pts;
        b = { id: uid("b"), name: `Obstruction ${n}`, kind, points: [a, { lat: a.lat, lng: c.lng }, c, { lat: c.lat, lng: a.lng }], height: 2.5, base: 0 };
      } else if (kind === "polygon") {
        if (pts.length < 3) return;
        b = { id: uid("b"), name: `Obstruction ${n}`, kind, points: pts, height: 2, base: 0 };
      } else {
        const r = Math.max(0.3, distanceM(pts[0], pts[1]));
        b = { id: uid("b"), name: kind === "tree" ? `Tree ${n}` : `Water tank ${n}`, kind, points: [], center: pts[0], radius: r, height: kind === "tree" ? 8 : 1.5, base: 0 };
      }
      // Sits on whichever roof it was drawn on; trees outside roofs are rooted at ground level.
      const c = b.center ?? centroid(b.points);
      const local = scene.proj.toLocal(c);
      const host = design.zones.find((z) => pointInPolygon(local, z.points.map(scene.proj.toLocal)));
      b.base = host ? host.height : 0;
      update((d) => ({ ...d, blockers: [...d.blockers, b] }));
      setSelection({ type: "blocker", id: b.id });
      setTab("blockers");
    }
    setTool("select");
  };

  const onPanelClick = (pid: string) => {
    if (!canEdit) return;
    if (tool === "string") {
      const taken = (design.strings ?? []).some((s) => s.panels.includes(pid));
      if (taken) return toast.error("That module is already in a string");
      setActiveString((a) => (a ? (a.includes(pid) ? a.filter((x) => x !== pid) : [...a, pid]) : [pid]));
      return;
    }
    if (pid.includes("|free:")) return removeFree(pid);
    const [zoneId, key] = pid.split("|");
    update((d) => ({
      ...d,
      zones: d.zones.map((z) => (z.id !== zoneId ? z : { ...z, removed: z.removed.includes(key) ? z.removed.filter((k) => k !== key) : [...z.removed, key] })),
      strings: (d.strings ?? []).map((s) => ({ ...s, panels: s.panels.filter((p) => p !== pid) })).filter((s) => s.panels.length),
    }));
  };

  // ── Module per zone
  const [moduleTarget, setModuleTarget] = useState<string | null>(null); // zone id, or null = whole design
  const moduleOfZone = (zoneId: string): ModuleModel => {
    const z = design.zones.find((x) => x.id === zoneId);
    if (!z?.module) return moduleModel;
    return findModule(z.moduleId ?? undefined, customMods) ?? ({ ...moduleModel, id: `zone-${z.id}`, brand: "", model: z.module.name, watt: z.module.watt, length: z.module.length * 1000, width: z.module.width * 1000 } as ModuleModel);
  };
  const moduleOfPid = (pid: string) => moduleOfZone(pid.split("|")[0]);

  // ── Moving panels
  const zoneAxesFor = (zoneId: string) => {
    const az = ((scene.zoneStats.find((x) => x.zoneId === zoneId)?.azimuth ?? 180) * Math.PI) / 180;
    return { r: { x: Math.cos(az), y: -Math.sin(az) }, b: { x: -Math.sin(az), y: -Math.cos(az) } };
  };
  const nudgeArray = (zoneId: string, du: number, dw: number) => {
    const st = scene.zoneStats.find((x) => x.zoneId === zoneId);
    const z = design.zones.find((x) => x.id === zoneId);
    const base = z?.shift ?? st?.shiftNow ?? { u: 0, w: 0 };
    patchZone(zoneId, { shift: { u: Math.round((base.u + du) * 1000) / 1000, w: Math.round((base.w + dw) * 1000) / 1000 } });
  };
  const onArrayMove = (zoneId: string, from: LatLng, to: LatLng) => {
    const a = scene.proj.toLocal(from), b2 = scene.proj.toLocal(to);
    const dx = b2.x - a.x, dy = b2.y - a.y;
    const { r, b } = zoneAxesFor(zoneId);
    nudgeArray(zoneId, dx * r.x + dy * r.y, dx * b.x + dy * b.y);
  };
  /** Grid module → hand-placed module (keeps its place in a string). */
  const detach = (d: DesignData, pid: string, patch: Partial<FreePanel>): DesignData => {
    const [zoneId, key] = pid.split("|");
    const zone = d.zones.find((z) => z.id === zoneId);
    const geom = scene.panels.find((p) => panelId(p) === pid);
    if (!zone || !geom) return d;
    const fp: FreePanel = { id: uid("f"), zoneId, center: scene.proj.toLatLng(geom.center), rotation: 0, orientation: zone.orientation, ...patch };
    const newPid = `${zoneId}|free:${fp.id}`;
    return {
      ...d,
      zones: d.zones.map((z) => (z.id === zoneId ? { ...z, removed: [...z.removed.filter((k) => k !== key), key] } : z)),
      freePanels: [...(d.freePanels ?? []), fp],
      strings: (d.strings ?? []).map((st) => ({ ...st, panels: st.panels.map((x) => (x === pid ? newPid : x)) })),
    };
  };
  const patchFree = (pid: string, patch: Partial<FreePanel>) => {
    const id = pid.split("|free:")[1];
    update((d) => (id ? { ...d, freePanels: (d.freePanels ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)) } : detach(d, pid, patch)));
  };
  const onPanelMove = (pid: string, center: LatLng) => patchFree(pid, { center });
  const rotatePanel = (pid: string, how: "90" | "15") => {
    const geom = scene.panels.find((p) => panelId(p) === pid);
    if (!geom) return;
    const id = pid.split("|free:")[1];
    const fp = id ? (design.freePanels ?? []).find((f) => f.id === id) : null;
    const orientation = fp?.orientation ?? design.zones.find((z) => z.id === geom.zoneId)?.orientation ?? "portrait";
    const rotation = fp?.rotation ?? 0;
    patchFree(pid, how === "90" ? { orientation: orientation === "portrait" ? "landscape" : "portrait" } : { rotation: (rotation + 15) % 360 });
  };
  const removeFree = (pid: string) => {
    const id = pid.split("|free:")[1];
    update((d) => ({
      ...d,
      freePanels: (d.freePanels ?? []).filter((f) => f.id !== id),
      strings: (d.strings ?? []).map((st) => ({ ...st, panels: st.panels.filter((x) => x !== pid) })).filter((st) => st.panels.length),
    }));
  };
  const onAddPanel = (at: LatLng) => {
    const local = scene.proj.toLocal(at);
    const zone = design.zones.find((z) => pointInPolygon(local, z.points.map(scene.proj.toLocal)));
    if (!zone) return toast.error("Click inside a roof zone to place a panel");
    update((d) => ({ ...d, freePanels: [...(d.freePanels ?? []), { id: uid("f"), zoneId: zone.id, center: at, rotation: 0, orientation: zone.orientation }] }));
  };

  const fillZone = (id: string) => patchZone(id, { removed: [] });
  const clearZone = (id: string) => patchZone(id, { removed: scene.panels.filter((p) => p.zoneId === id).map((p) => p.key) });
  // Line panels up with the roof (kept in sync as corners move; see roofAlignedAzimuth).
  const alignToEdge = (z: Zone) => patchZone(z.id, { alignToRoof: true, shift: null });

  // ── Stringing
  const inverters = (design.inverters ?? []).map((inst) => ({ inst, model: findInverter(inst.modelId, customInvs) })).filter((x): x is { inst: typeof x.inst; model: InverterModel } => !!x.model);
  const strings = design.strings ?? [];
  const order = useMemo(() => wiringOrder(scene, design), [scene, design]);
  const strung = new Set(strings.flatMap((s) => s.panels));
  const activeIds = new Set(scene.panels.filter((p) => !p.removed).map(panelId));
  const leftToString = [...activeIds].filter((p) => !strung.has(p)).length;
  const runAutoString = () => {
    const panels = order.filter((p) => activeIds.has(p));
    if (!panels.length) return toast.error("There are no modules to wire yet", "Draw a zone and fill it with panels first.");
    // Different modules never share a string: with mixed modules, each type gets its own inverter(s).
    const groups = new Map<string, { mod: ModuleModel; panels: string[] }>();
    for (const pid of panels) {
      const m = moduleOfPid(pid);
      const g = groups.get(m.id) ?? { mod: m, panels: [] };
      g.panels.push(pid);
      groups.set(m.id, g);
    }
    if (groups.size > 1) {
      const allInv: { inst: { id: string; modelId: string }; model: InverterModel }[] = [];
      const allStrings: StringDef[] = [];
      const left: string[] = [];
      for (const g of groups.values()) {
        const kwG = g.panels.length * g.mod.watt / 1000;
        const sug = suggestInverter(kwG, kwG > 6 ? "three" : "single", [...customInvs, ...INVERTERS]);
        if (!sug) { left.push(...g.panels); continue; }
        let count = Math.max(1, Math.ceil(kwG / 1.3 / sug.acKw - 1e-9));
        let plan = Array.from({ length: count }, () => ({ inst: { id: uid("i"), modelId: sug.id }, model: sug }));
        while (autoString(g.panels, g.mod, plan, temps).unstrung.length > 0 && count < 8) {
          count++;
          plan = Array.from({ length: count }, () => ({ inst: { id: uid("i"), modelId: sug.id }, model: sug }));
        }
        const r = autoString(g.panels, g.mod, plan, temps);
        allStrings.push(...r.strings.map((st) => ({ ...st, id: `S${allStrings.length + 1 + r.strings.indexOf(st)}`, inverterIndex: st.inverterIndex + allInv.length })));
        allInv.push(...plan);
        left.push(...r.unstrung);
      }
      update((d) => ({ ...d, inverters: allInv.map((x) => x.inst), strings: allStrings }));
      if (left.length) toast.error(`${left.length} module(s) couldn't be wired`, "Remove them or add another inverter.");
      else toast.success("Inverters sized and strings wired", `${groups.size} module types, each on its own inverter(s): ${allStrings.length} strings.`);
      return;
    }
    const onlyMod = [...groups.values()][0].mod;
    const kw = summary.systemKw;
    const totalAc = (list: typeof inverters) => list.reduce((a, i) => a + i.model.acKw, 0);
    const tryWith = (list: typeof inverters) => autoString(panels, onlyMod, list, temps);
    // The user's own inverters are kept if they can take the whole array without heavy clipping.
    const fitsAsIs = (list: typeof inverters) => list.length > 0 && totalAc(list) >= kw / 1.35 && tryWith(list).unstrung.length === 0;

    let invs = inverters;
    let note: string | null = null;
    if (!fitsAsIs(invs)) {
      // Above ~6 kW Indian homes are on three-phase supply; below that keep the phase the user picked.
      const phase: "single" | "three" = kw > 6 ? "three" : (inverters[0]?.model.phase ?? "single");
      const sug = suggestInverter(kw, phase, [...customInvs, ...INVERTERS]);
      if (!sug) return toast.error("No inverter in the catalog suits this array", "Add a custom inverter with + Inverter.");
      // Fewest units that take every module and keep DC/AC at or below ~1.3.
      let count = Math.max(1, Math.ceil(kw / 1.3 / sug.acKw - 1e-9));
      let plan = Array.from({ length: count }, () => ({ inst: { id: uid("i"), modelId: sug.id }, model: sug }));
      while (tryWith(plan).unstrung.length > 0 && count < 8) {
        count++;
        plan = Array.from({ length: count }, () => ({ inst: { id: uid("i"), modelId: sug.id }, model: sug }));
      }
      const label = `${count > 1 ? `${count} × ` : ""}${sug.brand} ${sug.model} (${count * sug.acKw} kW)`;
      note = invs.length
        ? `${invs.map((i) => `${i.model.brand} ${i.model.model}`).join(", ")} is too small for ${kw} kWp, so Auto-string switched to ${label}. Press Ctrl+Z to undo.`
        : `Picked ${label} for your ${kw} kWp array.`;
      invs = plan;
      update((d) => ({ ...d, inverters: plan.map((p) => p.inst) }));
    }
    const r = tryWith(invs);
    update((d) => ({ ...d, strings: r.strings }));
    const summaryLine = r.strings.length ? `${r.strings.length} string${r.strings.length === 1 ? "" : "s"} of ${[...new Set(r.strings.map((s) => s.panels.length))].join(" / ")} modules` : "";
    if (r.unstrung.length) toast.error(r.warnings[r.warnings.length - 1] ?? "Some modules couldn't be wired", note ?? undefined);
    else toast.success(note ? "Inverters sized and strings wired" : `Wired ${panels.length} modules`, [note, summaryLine].filter(Boolean).join(" "));
  };
  const finishManualString = () => {
    if (!activeString?.length) return setActiveString(null);
    const s: StringDef = { id: `S${strings.length + 1}`, inverterIndex: activeTarget.inverterIndex, mppt: activeTarget.mppt, panels: activeString };
    update((d) => ({ ...d, strings: [...(d.strings ?? []), s] }));
    setActiveString(null);
    setTool("select");
  };

  // ── Context menu actions
  const menuAction = (a: "props" | "dup" | "del" | "toggle") => {
    if (!menu) return;
    const t = menu.target;
    if (t.type === "panel") onPanelClick(t.id);
    else if (a === "props") { setSelection({ type: t.type, id: t.id }); setTab(t.type === "zone" ? "zones" : "blockers"); }
    else if (a === "dup") duplicate(t as { type: "zone" | "blocker"; id: string });
    else if (a === "del") {
      if (t.type === "zone") update((d) => ({ ...d, zones: d.zones.filter((z) => z.id !== t.id) }));
      else update((d) => ({ ...d, blockers: d.blockers.filter((b) => b.id !== t.id) }));
      setSelection(null);
    }
    setMenu(null);
  };

  // ── Report
  const downloadReport = () => {
    const r = fresh ?? annualAnalysis(design, scene, { monthlyGhi: climate?.ghiMonthly, monthlyClearness: climate?.clearness });
    if (!fresh) setAnalysis({ key: geomKey, result: r });
    const rows: (string | number)[][] = [
      ["Design", name],
      ["Customer", init.lead?.name ?? ""],
      ["Location", `${design.center.lat.toFixed(6)}, ${design.center.lng.toFixed(6)}`],
      ["Module", `${moduleModel.brand} ${moduleModel.model}`.trim()],
      ["Modules", summary.panelCount],
      ["System size (kWp)", summary.systemKw],
      ["Roof area (m²)", summary.areaM2],
      ["Shading loss: electrical, bypass-diode model (%)", r.shadingLossPct.toFixed(2)],
      ["Shading loss: area only (%)", r.geometricLossPct.toFixed(2)],
      ["Annual energy (kWh)", Math.round(r.annualKwh)],
      ["Specific yield (kWh/kWp)", Math.round(r.specificYield)],
      ["Weather", climate?.source ?? "Default clearness 0.75"],
      [],
      ["Month", "kWh", "Shading loss %"],
      ...MONTHS.map((m, i) => [m, Math.round(r.monthlyKwh[i]), r.monthlyLossPct[i].toFixed(2)]),
      [],
      ["Zone", "Module (row:col)", "Solar access %", "Area-only access %", "Sky view %", "kWh/yr", "String"],
      ...r.panels.map((p) => {
        const pid = `${p.zoneId}|${p.key}`;
        const si = strings.findIndex((s) => s.panels.includes(pid));
        return [design.zones.find((z) => z.id === p.zoneId)?.name ?? "", p.key, (p.solarAccess * 100).toFixed(1), (p.geometricAccess * 100).toFixed(1), (p.skyView * 100).toFixed(0), Math.round(p.annualKwh), si >= 0 ? strings[si].id : ""];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${name.replace(/[^\w-]+/g, "_")}-shading-report.csv`;
    a.click();
  };

  const share = async () => {
    try {
      const r = await api<{ shareToken: string; url: string }>(`/api/designs/${init.id}/share`, { method: "POST" });
      setShareToken(r.shareToken);
      setModal("share");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const selectedZone = selection?.type === "zone" ? design.zones.find((z) => z.id === selection.id) : undefined;
  const selectedBlocker = selection?.type === "blocker" ? design.blockers.find((b) => b.id === selection.id) : undefined;

  const hint =
    tool === "zone" ? "Click to add roof corners · click the first corner, double-click or press Enter to finish · Backspace undoes a point · Esc cancels"
    : tool === "rect" ? "Click two opposite corners of the obstruction"
    : tool === "polygon" ? "Click the obstruction's corners · double-click or Enter to finish"
    : tool === "circle" || tool === "tree" ? "Click the centre, then click the edge to set the radius"
    : tool === "inverter" ? "Click where the inverter will be mounted"
    : tool === "string" ? "Click modules in wiring order · click again to remove · Finish in the Layout panel"
    : tool === "addPanel" ? "Click inside a roof to place a module · drag it to adjust · Esc to stop"
    : design.zones.length === 0 ? 'Try creating a new zone by clicking on "Add Zone"'
    : "Click an object for its properties · Drag a module to move it · Right-click a module to rotate it · Click a module to remove/restore it";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-slate-800">
      {/* ── Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-3">
        <Link href={init.lead ? `/leads/${init.lead.id}` : "/designs"} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Back"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="h-6 w-px bg-slate-200" />
        <input value={name} onChange={(e) => { setName(e.target.value); setSaveState("dirty"); }} disabled={!canEdit} className="min-w-0 max-w-[260px] rounded px-1 text-base font-semibold text-teal-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none" />
        {init.lead && <span className="hidden truncate text-xs text-slate-400 md:inline">{init.lead.code} · {init.lead.name}</span>}
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 hidden text-sm font-semibold text-slate-600 sm:inline">Shading:</span>
          <TopBtn active={sunOpen} onClick={() => setSunOpen(!sunOpen)} title="Sun path & live shadows"><Sun className="h-4 w-4" /></TopBtn>
          <TopBtn active={heatmap} onClick={() => { setHeatmap(!heatmap); if (!heatmap) setModal(null); }} title="Annual shading heatmap"><Grid3x3 className="h-4 w-4" /></TopBtn>
          <TopBtn onClick={() => (fresh ? setModal("results") : (setHeatmap(true), runAnalysis(), setModal("results")))} title="Shading results"><LayoutGrid className="h-4 w-4" /></TopBtn>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <TopBtn onClick={downloadReport} title="Download shading report (CSV)"><Download className="h-4 w-4" /></TopBtn>
          {canEdit && <TopBtn onClick={share} title="Share preview with customer"><Share2 className="h-4 w-4" /></TopBtn>}
          {canEdit && (
            <TopBtn onClick={saveNow} title="Save (Ctrl+S)">
              {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : saveState === "saved" ? <Check className="h-4 w-4 text-teal-600" /> : <Save className={clsx("h-4 w-4", saveState === "error" ? "text-red-600" : "text-amber-600")} />}
            </TopBtn>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <nav className="flex items-center gap-1 border-b border-slate-100 px-3 pt-2 text-sm">
            {(["zones", "layout", "blockers"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); if (t !== "zones" && selection?.type === "zone") setSelection(null); }} className={clsx("-mb-px border-b-2 px-3 py-2 capitalize", tab === t ? "border-teal-600 font-semibold text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {t}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "zones" && (selectedZone ? (
              <ZoneProps
                zone={selectedZone}
                stats={scene.zoneStats.find((s) => s.zoneId === selectedZone.id)}
                moduleLabel={(() => { const m = moduleOfZone(selectedZone.id); return `${m.brand} ${m.model}`.trim(); })()}
                units={units}
                canEdit={canEdit}
                onBack={() => setSelection(null)}
                onChange={(p) => patchZone(selectedZone.id, p)}
                onFill={() => fillZone(selectedZone.id)}
                onClear={() => clearZone(selectedZone.id)}
                onAlign={() => alignToEdge(selectedZone)}
                onPickModule={() => { setModuleTarget(selectedZone.id); setModal("module"); }}
                onNudge={(du, dw) => nudgeArray(selectedZone.id, du, dw)}
                ownModule={!!selectedZone.module}
                onResetModule={() => patchZone(selectedZone.id, { module: null, moduleId: null })}
                onDelete={deleteSelection}
              />
            ) : (
              <div className="p-3">
                {canEdit && (
                  <div className="relative">
                    <button onClick={() => setAddMenu(addMenu === "zone" ? null : "zone")} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                      <Plus className="h-4 w-4" /> Add Zone <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {addMenu === "zone" && (
                      <div className="absolute z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        {ZONE_TYPES.map((t) => (
                          <button key={t.type} onClick={() => { setPendingZoneType(t.type); setTool("zone"); setAddMenu(null); setView("2d"); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                            <ZoneTypeIcon type={t.type} />
                            <span><span className="block text-sm font-medium">{t.label}</span><span className="block text-xs text-slate-500">{t.hint}</span></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500"><th className="px-2 py-2">Name</th><th className="px-2 py-2">Size</th><th className="px-2 py-2 text-right">Qty</th></tr></thead>
                  <tbody>
                    {design.zones.map((z) => {
                      const s = scene.zoneStats.find((x) => x.zoneId === z.id);
                      return (
                        <tr key={z.id} onClick={() => setSelection({ type: "zone", id: z.id })} className="cursor-pointer border-b border-slate-100 hover:bg-teal-50/50">
                          <td className="px-2 py-2 font-medium">{z.name}</td>
                          <td className="px-2 py-2">{(s?.kw ?? 0).toFixed(2)} kW</td>
                          <td className="px-2 py-2 text-right">{s?.panelCount ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {design.zones.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-500">
                    <MapIcon className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    <div className="font-medium text-slate-700">No Zones</div>
                    <div className="mt-1 text-xs">Zoom to the roof, then Add Zone and click its corners.</div>
                  </div>
                )}
                <button onClick={() => setModal("help")} className="mt-6 w-full rounded-lg border border-teal-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-teal-700 hover:bg-teal-50">Need help placing panels?</button>
              </div>
            ))}

            {tab === "blockers" && (selectedBlocker ? (
              <BlockerProps blocker={selectedBlocker} zones={design.zones} canEdit={canEdit} onBack={() => setSelection(null)} onChange={(p) => patchBlocker(selectedBlocker.id, p)} onDelete={deleteSelection} />
            ) : (
              <div className="p-3">
                {canEdit && (
                  <div className="relative">
                    <button onClick={() => setAddMenu(addMenu === "blocker" ? null : "blocker")} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                      <Plus className="h-4 w-4" /> Add Blocker <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {addMenu === "blocker" && (
                      <div className="absolute z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                        {([["rect", "Rectangle", "Staircase / lift room, wall"], ["polygon", "Polygon", "Any shape, like a neighbouring building"], ["circle", "Circle", "Water tank, chimney"], ["tree", "Tree", "Tree or tall vegetation"]] as const).map(([k, l, h]) => (
                          <button key={k} onClick={() => { setTool(k); setAddMenu(null); setView("2d"); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                            <span className="block text-sm font-medium">{l}</span><span className="block text-xs text-slate-500">{h}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500"><th className="px-2 py-2">Name</th><th className="px-2 py-2">Type</th><th className="px-2 py-2 text-right">Height</th></tr></thead>
                  <tbody>
                    {design.blockers.map((b) => (
                      <tr key={b.id} onClick={() => setSelection({ type: "blocker", id: b.id })} className="cursor-pointer border-b border-slate-100 hover:bg-teal-50/50">
                        <td className="px-2 py-2 font-medium">{b.name}</td>
                        <td className="px-2 py-2 capitalize text-slate-500">{b.kind}</td>
                        <td className="px-2 py-2 text-right">{fmtLen(b.height, units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {design.blockers.length === 0 && <div className="py-10 text-center text-sm text-slate-500"><div className="font-medium text-slate-700">No Blockers</div><div className="mt-1 text-xs">Add water tanks, staircase rooms, trees and neighbouring buildings. They decide the shading result.</div></div>}
              </div>
            ))}

            {tab === "layout" && (
              <div>
                <div className="flex gap-4 border-b border-slate-100 px-4 text-sm">
                  {(["inverter", "wire"] as const).map((s) => (
                    <button key={s} onClick={() => setLayoutSub(s)} className={clsx("-mb-px border-b-2 py-2 capitalize", layoutSub === s ? "border-teal-600 font-semibold text-teal-700" : "border-transparent text-slate-500")}>{s}</button>
                  ))}
                </div>
                {layoutSub === "inverter" ? (
                  <InverterPanel
                    canEdit={canEdit}
                    inverters={inverters}
                    strings={strings}
                    moduleModel={moduleModel}
                    moduleFor={(st) => (st.panels[0] ? moduleOfPid(st.panels[0]) : moduleModel)}
                    temps={temps}
                    tempSource={design.temps ? "manual" : climate ? climate.source : "default"}
                    leftToString={leftToString}
                    systemKw={summary.systemKw}
                    activeString={activeString}
                    activeTarget={activeTarget}
                    onAddInverter={() => setModal("inverter")}
                    onRemoveInverter={(i) => update((d) => ({ ...d, inverters: (d.inverters ?? []).filter((_, j) => j !== i), strings: (d.strings ?? []).filter((s) => s.inverterIndex !== i).map((s) => ({ ...s, inverterIndex: s.inverterIndex > i ? s.inverterIndex - 1 : s.inverterIndex })) }))}
                    onAutoString={runAutoString}
                    onClearStrings={() => update((d) => ({ ...d, strings: [] }))}
                    onRemoveString={(id) => update((d) => ({ ...d, strings: (d.strings ?? []).filter((s) => s.id !== id) }))}
                    onMoveString={(id, inverterIndex, mppt) => update((d) => ({ ...d, strings: (d.strings ?? []).map((s) => (s.id === id ? { ...s, inverterIndex, mppt } : s)) }))}
                    onTemps={(t) => update((d) => ({ ...d, temps: t }))}
                    onStartManual={() => { setActiveString([]); setTool("string"); setView("2d"); }}
                    onFinishManual={finishManualString}
                    onCancelManual={() => { setActiveString(null); setTool("select"); }}
                    onTarget={setActiveTarget}
                  />
                ) : (
                  <WirePanel design={design} scene={scene} strings={strings} inverters={inverters} moduleModel={moduleModel} temps={temps} units={units} canEdit={canEdit}
                    onPlace={() => { setTool("inverter"); setView("2d"); }}
                    onWiring={(w) => update((d) => ({ ...d, wiring: { acRunM: 15, dcSizeMm2: null, acSizeMm2: null, ...d.wiring, ...w } }))} />
                )}
              </div>
            )}
          </div>
          {/* Footer summary */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-200 p-3 text-center">
            {[["Size", `${summary.systemKw} kW`], ["Qty", String(summary.panelCount)], ["Area", fmtArea(summary.areaM2, units)]].map(([l, v]) => (
              <div key={l}><div className="text-xs text-slate-500">{l}</div><div className="mt-1 rounded-md bg-teal-600 px-1 py-1 text-xs font-semibold text-white">{v}</div></div>
            ))}
          </div>
        </aside>

        {/* ── Canvas */}
        <main className="relative min-w-0 flex-1 bg-slate-900" onContextMenu={(e) => e.preventDefault()}>
          {view === "2d" ? (
            <Map2D
              design={design} scene={scene} tool={tool} selection={selection} panelColors={panelColors} shadows={shadows} labelSize={labelSize} tileSource={tileSource} units={units}
              activeString={activeString} fitKey={fitKey}
              onSelect={(s) => { setSelection(s); if (s) setTab(s.type === "zone" ? "zones" : "blockers"); }}
              onFinishShape={onFinishShape}
              onEditZonePoints={(id, pts) => patchZone(id, { points: pts })}
              onEditBlocker={patchBlocker}
              onPanelClick={onPanelClick}
              onPanelMove={canEdit ? onPanelMove : undefined}
              onArrayMove={canEdit ? onArrayMove : undefined}
              onAddPanel={canEdit ? (at) => { onAddPanel(at); } : undefined}
              onPlaceInverter={(p) => { update((d) => ({ ...d, wiring: { acRunM: 15, dcSizeMm2: null, acSizeMm2: null, ...d.wiring, inverterAt: p } })); setTool("select"); }}
              onContext={(target, x, y) => canEdit && setMenu({ target, x, y })}
              onView={(center, zoom) => update((d) => (Math.abs(d.zoom - zoom) < 0.01 && d.zones.length ? d : { ...d, zoom, center: d.zones.length ? d.center : center }), false)}
              onOverlayBounds={(b) => update((d) => ({ ...d, overlay: d.overlay ? { ...d.overlay, bounds: b } : d.overlay }))}
              onCancelTool={() => { setTool("select"); setActiveString(null); }}
              onBoundsGetter={(g) => (boundsGetter.current = g)}
            />
          ) : (
            <View3D design={design} scene={scene} panelColors={panelColors} when={when} showSunPath={sunOpen} onBearing={setBearing} resetNorth={resetNorth} />
          )}

          {/* Live sun panel */}
          {sunOpen && (
            <div className="absolute left-3 top-3 z-[500] w-72 rounded-xl bg-white/95 p-4 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-semibold">Sun path</h4>
                <button onClick={() => setSunOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>
              <SunControls when={when} onChange={setWhen} lat={design.center.lat} lng={design.center.lng} compact={view === "3d"} />
              {instant && scene.panels.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  Right now: <b>{instant.panels.filter((p) => p && p.shadedArea > 0).length}</b> of {summary.panelCount} modules touched by shade · output loss{" "}
                  <b>{((instant.panels.reduce((a, p) => a + (p?.electricalLoss ?? 0), 0) / Math.max(1, summary.panelCount)) * 100).toFixed(0)}%</b>
                </div>
              )}
            </div>
          )}

          {/* Heatmap legend / status */}
          {heatmap && (
            <div className="absolute bottom-20 left-3 z-[500] rounded-xl bg-white/95 p-3 text-xs shadow-xl">
              <div className="mb-1.5 flex items-center gap-2 font-semibold">Annual solar access {analysing && <Loader2 className="h-3 w-3 animate-spin" />}</div>
              {[["≥ 95%", "#16a34a"], ["90–95%", "#84cc16"], ["80–90%", "#eab308"], ["70–80%", "#f97316"], ["< 70%", "#dc2626"]].map(([l, c]) => (
                <div key={l} className="flex items-center gap-2 py-0.5"><span className="h-3 w-5 rounded-sm" style={{ background: c }} />{l}</div>
              ))}
              {fresh && (
                <button onClick={() => setModal("results")} className="mt-2 w-full rounded-md bg-teal-600 px-2 py-1 font-semibold text-white">
                  Loss {fresh.shadingLossPct.toFixed(1)}% · {Math.round(fresh.annualKwh).toLocaleString("en-IN")} kWh/yr
                </button>
              )}
            </div>
          )}

          {/* Compass */}
          <button
            onClick={() => (view === "3d" ? setResetNorth((n) => n + 1) : undefined)}
            title={view === "3d" ? "Reset view to north" : "North is up"}
            className="absolute right-3 top-3 z-[500] grid h-14 w-14 place-items-center rounded-full border-2 border-white/80 bg-slate-900/80 shadow-lg"
          >
            <svg viewBox="0 0 56 56" className="h-12 w-12" style={{ transform: `rotate(${view === "3d" ? -bearing : 0}deg)` }}>
              {Array.from({ length: 24 }, (_, i) => <line key={i} x1="28" y1="3" x2="28" y2={i % 6 === 0 ? 8 : 5.5} stroke="#fff" strokeWidth="1" transform={`rotate(${i * 15} 28 28)`} />)}
              <text x="28" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="#f87171">N</text>
              <text x="47" y="31" textAnchor="middle" fontSize="7" fill="#fff">E</text>
              <text x="28" y="47" textAnchor="middle" fontSize="7" fill="#fff">S</text>
              <text x="9" y="31" textAnchor="middle" fontSize="7" fill="#fff">W</text>
              <path d="M28 18 L31 28 L28 26 L25 28 Z" fill="#f87171" /><path d="M28 38 L31 28 L28 30 L25 28 Z" fill="#fff" />
            </svg>
          </button>

          {/* Right-side view buttons */}
          <div className="absolute bottom-20 right-3 z-[500] flex flex-col items-end gap-2">
            <button onClick={() => window.open(window.location.href, "_blank", "noopener")} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-teal-700 shadow-lg hover:bg-teal-50" title="Open in new window"><ExternalLink className="h-4 w-4" /></button>
            <button onClick={() => setModal("drone")} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-teal-700 shadow-lg hover:bg-teal-50"><Plane className="h-4 w-4" /> Drone View</button>
            <button onClick={() => { setView(view === "2d" ? "3d" : "2d"); setTool("select"); }} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-xs font-semibold text-teal-700 shadow-lg hover:bg-teal-50">
              <Box className="h-5 w-5" /><span className="leading-tight">Switch to<br />{view === "2d" ? "3D View" : "2D View"}</span>
            </button>
          </div>

          {/* Bottom toolbar */}
          {view === "2d" && canEdit && (
            <div className="absolute bottom-4 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white px-2 py-1.5 shadow-xl">
              <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="Select"><MousePointer2 className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={() => selectedZone ? fillZone(selectedZone.id) : toast.error("Select a zone first")} title="Fill selected zone with panels"><LayoutGrid className="h-4 w-4" /></ToolBtn>
              <ToolBtn active={tool === "addPanel"} onClick={() => setTool(tool === "addPanel" ? "select" : "addPanel")} title="Add panel: click to place a single module"><SquarePlus className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></ToolBtn>
              <ToolBtn active={tool === "zone"} onClick={() => { setPendingZoneType("flat"); setTool("zone"); }} title="Draw zone"><Pencil className="h-4 w-4" /></ToolBtn>
              <ToolBtn onClick={deleteSelection} disabled={!selection} title="Delete selected (Del)"><Trash2 className={clsx("h-4 w-4", selection && "text-red-600")} /></ToolBtn>
            </div>
          )}

          {/* Context menu */}
          {menu && (
            <>
              <div className="fixed inset-0 z-[600]" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
              <div className="fixed z-[601] w-44 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl" style={{ left: menu.x, top: menu.y }}>
                {menu.target.type === "panel" ? (
                  <>
                    <MenuItem onClick={() => { rotatePanel(menu.target.id, "90"); setMenu(null); }}>Rotate 90°</MenuItem>
                    <MenuItem onClick={() => { rotatePanel(menu.target.id, "15"); setMenu(null); }}>Turn 15°</MenuItem>
                    <MenuItem onClick={() => menuAction("toggle")} danger>{menu.target.id.includes("|free:") ? "Delete module" : "Remove / restore module"}</MenuItem>
                  </>
                ) : (
                  <>
                    <MenuItem onClick={() => menuAction("props")}>Properties</MenuItem>
                    <MenuItem onClick={() => menuAction("dup")}><Copy className="h-3.5 w-3.5" /> Duplicate</MenuItem>
                    <MenuItem onClick={() => menuAction("del")} danger><Trash2 className="h-3.5 w-3.5" /> Delete</MenuItem>
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Bottom status bar */}
      <footer className="flex h-8 shrink-0 items-center gap-3 bg-teal-700 px-3 text-xs text-white">
        <span className="truncate"><HelpCircle className="mr-1 inline h-3.5 w-3.5" />{hint}</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={labelSize} onChange={(e) => setLabelSize(e.target.value as "s" | "m" | "l")} className="rounded bg-teal-800 px-1.5 py-0.5"><option value="s">Label: small</option><option value="m">Label: medium</option><option value="l">Label: large</option></select>
          <select value={tileSource} onChange={(e) => setTileSource(e.target.value as TileSource)} className="rounded bg-teal-800 px-1.5 py-0.5"><option value="esri">Solar Map</option><option value="clarity">Clarity imagery</option><option value="streets">Street map</option></select>
          <select value={units} onChange={(e) => update((d) => ({ ...d, units: e.target.value as "m" | "ft" }), false)} className="rounded bg-teal-800 px-1.5 py-0.5"><option value="m">Metre</option><option value="ft">Feet</option></select>
        </div>
      </footer>

      {/* ── Modals */}
      {modal === "module" && (
        <ModulePicker
          custom={customMods}
          current={design.moduleId}
          onPick={(m) => {
            const spec = { name: `${m.brand} ${m.model}`, watt: m.watt, length: m.length / 1000, width: m.width / 1000 };
            if (moduleTarget && design.zones.some((z) => z.id === moduleTarget)) {
              // A zone with its own module; picking the design's module simply clears the override.
              patchZone(moduleTarget, m.id === design.moduleId ? { module: null, moduleId: null } : { module: spec, moduleId: m.id });
            } else update((d) => ({ ...d, moduleId: m.id, module: spec }));
            setModuleTarget(null);
            setModal(null);
          }}
          onAddCustom={(m) => update((d) => ({ ...d, customModules: [...(d.customModules ?? []), m] }))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "inverter" && (
        <InverterPicker
          custom={customInvs}
          systemKw={summary.systemKw}
          onPick={(iv) => { update((d) => ({ ...d, inverters: [...(d.inverters ?? []), { id: uid("i"), modelId: iv.id }] })); setModal(null); }}
          onAddCustom={(iv) => update((d) => ({ ...d, customInverters: [...(d.customInverters ?? []), iv] }))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "drone" && (
        <DroneModal
          overlay={design.overlay ?? null}
          onClose={() => setModal(null)}
          onSet={(url) => {
            const b = boundsGetter.current?.() ?? [{ lat: design.center.lat - 0.0003, lng: design.center.lng - 0.0003 }, { lat: design.center.lat + 0.0003, lng: design.center.lng + 0.0003 }];
            update((d) => ({ ...d, overlay: { url, bounds: b, opacity: 0.85 } }));
            setView("2d");
          }}
          onOpacity={(o) => update((d) => ({ ...d, overlay: d.overlay ? { ...d.overlay, opacity: o } : null }), false)}
          onRemove={() => update((d) => ({ ...d, overlay: null }))}
        />
      )}
      {modal === "help" && (
        <Modal title="Placing panels" onClose={() => setModal(null)}>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Zoom the map right onto the customer&apos;s roof (scroll / pinch).</li>
            <li><b>Add Zone</b> → pick the roof type → click each roof corner. Finish by clicking the first corner or double-clicking. Edge lengths show as you draw. Match them to your site measurements, then drag corners to correct.</li>
            <li>Set the <b>zone height</b> (building height), parapet height and structure height. They decide what shades what.</li>
            <li>Modules fill the roof automatically, respecting the setback and an auto row gap that avoids row-to-row shading between 9 am and 3 pm all year. Click any module to remove or restore it.</li>
            <li>Add <b>Blockers</b>: water tanks, staircase rooms, trees and neighbouring buildings, with their real heights.</li>
            <li>Open <b>Shading → heatmap</b> for annual losses per module, and the <b>sun</b> button to scrub shadows through the day and year.</li>
            <li>In <b>Layout → Inverter</b>, add an inverter (or let Auto-string pick one) and string the modules; <b>Wire</b> sizes the DC/AC cables.</li>
          </ol>
        </Modal>
      )}
      {modal === "share" && shareToken && (
        <Modal title="Customer preview link" onClose={() => setModal(null)}>
          <p className="text-sm text-slate-600">Anyone with this link can view the 3D design and sun path (read-only).</p>
          <div className="mt-3 flex gap-2">
            <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/d/${shareToken}`} className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm" onFocus={(e) => e.target.select()} />
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/d/${shareToken}`); toast.success("Link copied"); }} className="rounded-md bg-teal-600 px-3 text-sm font-semibold text-white">Copy</button>
          </div>
          <div className="mt-4 flex justify-between">
            <a href={`/d/${shareToken}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-teal-700 hover:underline">Open preview ↗</a>
            <button onClick={async () => { await api(`/api/designs/${init.id}/share`, { method: "DELETE" }); setShareToken(null); setModal(null); toast.success("Link revoked"); }} className="text-sm text-red-600 hover:underline">Revoke link</button>
          </div>
        </Modal>
      )}
      {modal === "results" && (
        <Modal title="Shading analysis" onClose={() => setModal(null)} wide>
          {analysing || !fresh ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Simulating the sun every 30 minutes across a full year…</div>
          ) : (
            <ResultsView r={fresh} climate={climate} />
          )}
        </Modal>
      )}
    </div>
  );
}

function centroid(pts: LatLng[]): LatLng {
  return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
}
function distanceM(a: LatLng, b: LatLng) {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * 110574);
}

function TopBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return <button onClick={onClick} title={title} className={clsx("grid h-8 w-8 place-items-center rounded-md", active ? "bg-teal-600 text-white" : "text-teal-700 hover:bg-teal-50")}>{children}</button>;
}
function ToolBtn({ children, onClick, title, active, disabled }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} title={title} disabled={disabled} className={clsx("grid h-9 w-9 place-items-center rounded-lg disabled:opacity-30", active ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100")}>{children}</button>;
}
function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={clsx("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50", danger && "text-red-600")}>{children}</button>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-b border-slate-100 px-4 py-3"><h5 className="mb-1 text-sm font-semibold text-slate-800">{title}</h5>{children}</div>;
}

function ZoneProps({ zone, stats, moduleLabel, units, canEdit, onBack, onChange, onFill, onClear, onAlign, onPickModule, onDelete, onNudge, ownModule, onResetModule }: {
  zone: Zone; stats?: { areaM2: number; panelCount: number; kw: number; rowGap: number; azimuth: number; shiftNow: { u: number; w: number } }; moduleLabel: string; units: "m" | "ft"; canEdit: boolean;
  onBack: () => void; onChange: (p: Partial<Zone>) => void; onFill: () => void; onClear: () => void; onAlign: () => void; onPickModule: () => void; onDelete: () => void;
  onNudge: (du: number, dw: number) => void; ownModule: boolean; onResetModule: () => void;
}) {
  const dirNow = Math.round((stats?.azimuth ?? (zone.type === "tilted" ? zone.roofAzimuth : zone.azimuth)) * 10) / 10;
  const setDir = (v: number) => {
    const az = Math.round((((v % 360) + 360) % 360) * 10) / 10;
    onChange(zone.type === "tilted" ? { roofAzimuth: az, alignToRoof: false } : { azimuth: az, alignToRoof: false });
  };
  const compass = (a: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((a % 360) + 360) % 360) / 45) % 8];
  const eff = effectiveZone(zone);
  const [editingName, setEditingName] = useState(false);
  return (
    <fieldset disabled={!canEdit}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="h-4 w-4" /></button>
        {editingName ? (
          <input autoFocus defaultValue={zone.name} onBlur={(e) => { onChange({ name: e.target.value || zone.name }); setEditingName(false); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="flex-1 rounded border border-slate-200 px-1 text-lg font-semibold text-teal-700" />
        ) : (
          <h4 className="flex-1 text-lg font-semibold text-teal-700">{zone.name}</h4>
        )}
        <button type="button" onClick={() => setEditingName(true)} className="text-slate-400 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        {ZONE_TYPES.map((t) => (
          <button type="button" key={t.type} onClick={() => onChange({ type: t.type, ...(t.type === "shed" && zone.type !== "shed" ? { mountHeight: 2.4 } : {}), ...(t.type !== "shed" && zone.type === "shed" ? { mountHeight: 0.5 } : {}) })} title={t.hint}
            className={clsx("relative flex flex-col items-center rounded-lg border p-1.5 text-[11px] font-medium", zone.type === t.type ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
            {zone.type === t.type && <Check className="absolute right-1 top-1 h-3 w-3 rounded-full bg-teal-600 p-0.5 text-white" />}
            <ZoneTypeIcon type={t.type} />{t.label}
          </button>
        ))}
      </div>
      {zone.type === "tilted" && (
        <Section title="Tilted Roof">
          <NumField label="Tilt" value={zone.roofTilt} onChange={(v) => onChange({ roofTilt: Math.max(0, Math.min(60, v)) })} unit="°" step={1} />
          <p className="text-xs text-slate-400">The slope&apos;s direction is set in <b>Panel direction</b> below.</p>
        </Section>
      )}
      <Section title="Zone">
        <NumField label={zone.type === "tilted" ? "Eave height" : "Height"} value={zone.height} onChange={(v) => onChange({ height: Math.max(0, v) })} unit="m" />
        {zone.type !== "tilted" && <NumField label="Parapet height" value={zone.parapetHeight} onChange={(v) => onChange({ parapetHeight: Math.max(0, v) })} unit="m" />}
        <div className="flex justify-between py-1 text-sm text-slate-500"><span>Area</span><span>{fmtArea(stats?.areaM2 ?? 0, units)}</span></div>
      </Section>
      <Section title="Panel direction">
        <label className="flex items-start gap-2 py-1 text-sm text-slate-600">
          <input type="checkbox" className="mt-1" checked={!!zone.alignToRoof} onChange={(e) => (e.target.checked ? onAlign() : onChange({ alignToRoof: false }))} />
          <span>Line up with the roof<span className="block text-xs text-slate-400">Panels run parallel to the roof edges and follow them when you move a corner.</span></span>
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input type="range" min={0} max={359} step={1} value={dirNow} onChange={(e) => setDir(Number(e.target.value))} className="sun-range w-full" aria-label="Panel direction" />
          <span className="w-20 text-right text-sm font-semibold tabular-nums text-slate-700">{dirNow}° {compass(dirNow)}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {[-5, -1, 1, 5].map((d) => (
            <button type="button" key={d} onClick={() => setDir(dirNow + d)} className="rounded-md border border-slate-200 py-1 text-xs font-medium hover:bg-slate-50">{d > 0 ? `+${d}` : d}°</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">Direction the panels face (180° = south). {zone.type === "tilted" ? "On a tilted roof this is the slope's direction." : ""}</p>
      </Section>
      <Section title="Array position">
        <div className="flex items-start gap-3">
          <div className="grid shrink-0 grid-cols-[32px_32px_32px] gap-1">
            <span />
            <button type="button" title="Move up the slope 10 cm" onClick={() => onNudge(0, 0.1)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 hover:bg-slate-50">▲</button>
            <span />
            <button type="button" title="Move along the row 10 cm" onClick={() => onNudge(-0.1, 0)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 hover:bg-slate-50">◀</button>
            <button type="button" title="Back to automatic best fit" onClick={() => onChange({ shift: null })} className={clsx("grid h-8 w-8 place-items-center rounded-md border text-[10px] font-semibold", zone.shift ? "border-slate-200 hover:bg-slate-50" : "border-teal-500 bg-teal-50 text-teal-700")}>Auto</button>
            <button type="button" title="Move along the row 10 cm" onClick={() => onNudge(0.1, 0)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 hover:bg-slate-50">▶</button>
            <span />
            <button type="button" title="Move down the slope 10 cm" onClick={() => onNudge(0, -0.1)} className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 hover:bg-slate-50">▼</button>
            <span />
          </div>
          <p className="text-xs text-slate-500">Nudge the whole array 10 cm at a time, or drag the blue handle on the map. <b>Auto</b> picks the position that fits the most panels.</p>
        </div>
      </Section>
      <Section title="Panels">
        <button type="button" onClick={onPickModule} className="mb-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-left text-xs hover:bg-slate-50">
          <span className="block text-slate-400">Module {ownModule ? "(this zone only)" : "(same as the design)"}</span><span className="font-medium text-slate-700">{moduleLabel}</span>
        </button>
        {ownModule && <button type="button" onClick={onResetModule} className="mb-2 text-xs font-medium text-teal-700 hover:underline">Use the design&apos;s module</button>}
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
          {(["portrait", "landscape"] as const).map((o) => (
            <button type="button" key={o} onClick={() => onChange({ orientation: o })} className={clsx("rounded-md py-1 capitalize", zone.orientation === o ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>{o}</button>
          ))}
        </div>
        {zone.type !== "tilted" && (
          <>
            <NumField label="Panel tilt" value={zone.tilt} onChange={(v) => onChange({ tilt: Math.max(0, Math.min(60, v)) })} unit="°" step={1} />
            <NumField label={zone.type === "shed" ? "Structure height" : "Structure (low edge)"} value={zone.mountHeight} onChange={(v) => onChange({ mountHeight: Math.max(0, v) })} unit="m" />
          </>
        )}
        <NumField label="Setback" value={zone.setback} onChange={(v) => onChange({ setback: Math.max(0, v) })} unit="m" />
        <label className="flex items-center justify-between py-1 text-sm text-slate-600">
          <span>Row gap</span>
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={zone.rowGap === null} onChange={(e) => onChange({ rowGap: e.target.checked ? null : Math.round((stats?.rowGap ?? 1) * 100) / 100 })} /> Auto</label>
            <input type="number" step={0.05} disabled={zone.rowGap === null} value={Math.round((zone.rowGap ?? stats?.rowGap ?? 0) * 100) / 100} onChange={(e) => onChange({ rowGap: Math.max(0, Number(e.target.value)) })} className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right text-sm disabled:bg-slate-50" />
            <span className="w-6 text-xs text-slate-400">m</span>
          </span>
        </label>
        <NumField label="Column gap" value={zone.colGap} onChange={(v) => onChange({ colGap: Math.max(0, v) })} unit="m" step={0.01} />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onFill} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-teal-600 px-2 py-2 text-xs font-semibold text-white hover:bg-teal-700"><Plus className="h-3.5 w-3.5" /> Panels</button>
          <button type="button" onClick={onClear} className="flex-1 rounded-md border border-slate-200 px-2 py-2 text-xs font-medium hover:bg-slate-50">Clear panels</button>
        </div>
        <div className="mt-2 text-xs text-slate-500">{stats?.panelCount ?? 0} modules · {(stats?.kw ?? 0).toFixed(2)} kWp{eff.rowGap === null || zone.rowGap === null ? ` · auto row gap ${fmtLen(stats?.rowGap ?? 0, units, 2)}` : ""}</div>
      </Section>
      <div className="p-4"><button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete zone</button></div>
    </fieldset>
  );
}

function BlockerProps({ blocker, zones, canEdit, onBack, onChange, onDelete }: { blocker: Blocker; zones: Zone[]; canEdit: boolean; onBack: () => void; onChange: (p: Partial<Blocker>) => void; onDelete: () => void }) {
  return (
    <fieldset disabled={!canEdit}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600"><ArrowLeft className="h-4 w-4" /></button>
        <input value={blocker.name} onChange={(e) => onChange({ name: e.target.value })} className="flex-1 rounded px-1 text-lg font-semibold text-teal-700 hover:bg-slate-50" />
      </div>
      <Section title="Size">
        <NumField label={blocker.kind === "tree" ? "Tree height" : "Height"} value={blocker.height} onChange={(v) => onChange({ height: Math.max(0.1, v) })} unit="m" />
        {(blocker.kind === "circle" || blocker.kind === "tree") && <NumField label={blocker.kind === "tree" ? "Canopy radius" : "Radius"} value={blocker.radius ?? 1} onChange={(v) => onChange({ radius: Math.max(0.1, v) })} unit="m" />}
      </Section>
      <Section title="Placement">
        <label className="flex items-center justify-between gap-2 py-1 text-sm text-slate-600">
          <span>Sits on</span>
          <select className="rounded-md border border-slate-200 px-2 py-1 text-sm" value={zones.find((z) => Math.abs(z.height - blocker.base) < 1e-6)?.id ?? (blocker.base === 0 ? "ground" : "custom")}
            onChange={(e) => onChange({ base: e.target.value === "ground" ? 0 : e.target.value === "custom" ? blocker.base : zones.find((z) => z.id === e.target.value)?.height ?? 0 })}>
            <option value="ground">Ground</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name} roof</option>)}
            <option value="custom">Custom height</option>
          </select>
        </label>
        <NumField label="Base above ground" value={blocker.base} onChange={(v) => onChange({ base: v })} unit="m" />
        <p className="text-xs text-slate-400">Top of obstruction: {(blocker.base + blocker.height).toFixed(2)} m above ground.</p>
      </Section>
      <div className="p-4"><button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete blocker</button></div>
    </fieldset>
  );
}

function InverterPanel(p: {
  canEdit: boolean; inverters: { inst: { id: string; modelId: string }; model: InverterModel }[]; strings: StringDef[]; moduleModel: ModuleModel; moduleFor: (s: StringDef) => ModuleModel; temps: { minC: number; maxC: number }; tempSource: string;
  leftToString: number; systemKw: number; activeString: string[] | null; activeTarget: { inverterIndex: number; mppt: number };
  onAddInverter: () => void; onRemoveInverter: (i: number) => void; onAutoString: () => void; onClearStrings: () => void; onRemoveString: (id: string) => void;
  onMoveString: (id: string, inv: number, mppt: number) => void; onTemps: (t: { minC: number; maxC: number }) => void; onStartManual: () => void; onFinishManual: () => void; onCancelManual: () => void;
  onTarget: (t: { inverterIndex: number; mppt: number }) => void;
}) {
  const totalAc = p.inverters.reduce((a, i) => a + i.model.acKw, 0);
  return (
    <fieldset disabled={!p.canEdit} className="space-y-3 p-3">
      <div className="flex gap-2">
        <button type="button" onClick={p.onAddInverter} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"><Plus className="h-4 w-4" /> Inverter</button>
        <button type="button" onClick={p.onAutoString} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"><Zap className="h-4 w-4" /> Auto-string</button>
      </div>
      <div className={clsx("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", p.leftToString ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800")}>
        {p.leftToString ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />} Panels left to string: <b>{p.leftToString}</b>
      </div>
      <div className="rounded-lg border border-slate-200 p-2 text-xs">
        <div className="mb-1 font-semibold text-slate-700">Site temperatures <span className="font-normal text-slate-400">({p.tempSource})</span></div>
        <div className="grid grid-cols-2 gap-2">
          <label>Record low °C<input type="number" value={p.temps.minC} onChange={(e) => p.onTemps({ ...p.temps, minC: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1" /></label>
          <label>Design high °C<input type="number" value={p.temps.maxC} onChange={(e) => p.onTemps({ ...p.temps, maxC: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1" /></label>
        </div>
      </div>
      {p.inverters.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500"><div className="font-medium text-slate-700">No Inverters</div><div className="mt-1 text-xs">Add one, or press Auto-string to pick a right-sized inverter automatically.</div></div>
      ) : (
        <div className="text-xs text-slate-500">DC/AC ratio <b className={totalAc && (p.systemKw / totalAc > 1.35 || p.systemKw / totalAc < 0.9) ? "text-red-600" : "text-slate-700"}>{totalAc ? (p.systemKw / totalAc).toFixed(2) : "-"}</b> (aim 1.0–1.3){totalAc && p.systemKw / totalAc > 1.35 ? ". Inverter is undersized, expect clipping" : ""}</div>
      )}
      {p.inverters.map((iv, i) => {
        const lim = stringLimits(p.moduleModel, iv.model, p.temps);
        return (
          <div key={iv.inst.id} className="rounded-lg border border-slate-200">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <div><div className="text-sm font-semibold">Inverter {i + 1}: {iv.model.brand} {iv.model.model}</div><div className="text-xs text-slate-500">{iv.model.acKw} kW AC · {iv.model.mppts} MPPT · {lim.min}–{lim.max} modules/string</div></div>
              <button type="button" onClick={() => p.onRemoveInverter(i)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            {p.strings.map((s, si) => ({ s, si })).filter(({ s }) => s.inverterIndex === i).map(({ s, si }) => {
              const sm = p.moduleFor(s);
              const chk = checkString(s, p.strings, sm, iv.model, p.temps);
              const sl = stringLimits(sm, iv.model, p.temps);
              return (
                <div key={s.id} className="border-b border-slate-50 px-3 py-2 text-xs last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STRING_COLORS[si % STRING_COLORS.length] }} />
                    <b>{s.id}</b> · {s.panels.length} modules
                    <select value={s.mppt} onChange={(e) => p.onMoveString(s.id, i, Number(e.target.value))} className="ml-auto rounded border border-slate-200 px-1 py-0.5">
                      {Array.from({ length: iv.model.mppts }, (_, k) => <option key={k} value={k}>MPPT {k + 1}</option>)}
                    </select>
                    <button type="button" onClick={() => p.onRemoveString(s.id)} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-1 text-slate-500">Voc (cold) {(s.panels.length * sl.vocCold).toFixed(0)} V · Vmp (hot) {(s.panels.length * sl.vmpHot).toFixed(0)} V</div>
                  {chk.issues.map((x) => <div key={x} className="mt-0.5 text-red-600">⚠ {x}</div>)}
                </div>
              );
            })}
          </div>
        );
      })}
      {p.inverters.length > 0 && (p.activeString ? (
        <div className="rounded-lg border-2 border-dashed border-teal-400 p-3 text-xs">
          <div className="font-semibold">Drawing string: {p.activeString.length} modules</div>
          <div className="mt-2 flex gap-2">
            <select value={p.activeTarget.inverterIndex} onChange={(e) => p.onTarget({ inverterIndex: Number(e.target.value), mppt: 0 })} className="flex-1 rounded border border-slate-200 px-1 py-1">
              {p.inverters.map((_, i) => <option key={i} value={i}>Inverter {i + 1}</option>)}
            </select>
            <select value={p.activeTarget.mppt} onChange={(e) => p.onTarget({ ...p.activeTarget, mppt: Number(e.target.value) })} className="flex-1 rounded border border-slate-200 px-1 py-1">
              {Array.from({ length: p.inverters[p.activeTarget.inverterIndex]?.model.mppts ?? 1 }, (_, k) => <option key={k} value={k}>MPPT {k + 1}</option>)}
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={p.onFinishManual} className="flex-1 rounded-md bg-teal-600 py-1.5 font-semibold text-white">Finish string</button>
            <button type="button" onClick={p.onCancelManual} className="flex-1 rounded-md border border-slate-200 py-1.5">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={p.onStartManual} className="flex-1 rounded-md border border-slate-200 py-1.5 font-medium hover:bg-slate-50">Draw string manually</button>
          {p.strings.length > 0 && <button type="button" onClick={p.onClearStrings} className="flex-1 rounded-md border border-slate-200 py-1.5 font-medium text-red-600 hover:bg-red-50">Clear strings</button>}
        </div>
      ))}
    </fieldset>
  );
}

function WirePanel({ design, scene, strings, inverters, moduleModel, temps, units, canEdit, onPlace, onWiring }: {
  design: DesignData; scene: ReturnType<typeof buildScene>; strings: StringDef[]; inverters: { model: InverterModel }[]; moduleModel: ModuleModel; temps: { minC: number; maxC: number };
  units: "m" | "ft"; canEdit: boolean; onPlace: () => void; onWiring: (w: Partial<NonNullable<DesignData["wiring"]>>) => void;
}) {
  const w = design.wiring ?? { acRunM: 15, dcSizeMm2: null, acSizeMm2: null, inverterAt: null };
  const byId = new Map(scene.panels.map((p) => [panelId(p), p]));
  const inv = w.inverterAt ? scene.proj.toLocal(w.inverterAt) : null;
  const rows = strings.map((s) => {
    const ps = s.panels.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!ps.length || !inv) return { s, len: 0 };
    const z = design.zones.find((zz) => zz.id === ps[0].zoneId);
    const onRoof = z ? pointInPolygon(inv, z.points.map(scene.proj.toLocal)) : false;
    const vertical = onRoof ? 1 : (z?.height ?? 3) + 1;
    const home = (p: { center: { x: number; y: number } }) => Math.hypot(p.center.x - inv.x, p.center.y - inv.y) * 1.15 + vertical;
    // Inter-module jumps longer than a module's own leads need extra cable.
    let jumps = 0;
    for (let i = 1; i < ps.length; i++) jumps += Math.max(0, Math.hypot(ps[i].center.x - ps[i - 1].center.x, ps[i].center.y - ps[i - 1].center.y) - 1.3 * Math.max(ps[i].w, ps[i].l));
    const total = home(ps[0]) + home(ps[ps.length - 1]) + jumps;
    return { s, len: total };
  });
  const lim = inverters[0] ? stringLimits(moduleModel, inverters[0].model, temps) : null;
  const totalAc = inverters.reduce((a, i) => a + i.model.acKw, 0);
  const phase = inverters[0]?.model.phase ?? "single";
  const acSize = w.acSizeMm2 ?? pickCable((sz) => acVoltageDrop(w.acRunM, totalAc, phase, sz).pct, 2);
  const ac = acVoltageDrop(w.acRunM, totalAc, phase, acSize);
  const totalDc = rows.reduce((a, r) => a + r.len, 0);
  return (
    <fieldset disabled={!canEdit} className="space-y-3 p-3 text-sm">
      <button type="button" onClick={onPlace} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"><Cable className="h-4 w-4" /> {w.inverterAt ? "Move inverter" : "Place inverter on map"}</button>
      {!w.inverterAt && <p className="text-xs text-slate-500">Place the inverter to compute DC home-run lengths and voltage drop.</p>}
      {!strings.length && <p className="text-xs text-slate-500">String the modules in the Inverter tab first.</p>}
      {inv && strings.length > 0 && (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th className="py-1">String</th><th>DC cable</th><th>Size</th><th className="text-right">Drop</th></tr></thead>
          <tbody>
            {rows.map(({ s, len }, i) => {
              const vStr = s.panels.length * (lim?.vmpHot ?? moduleModel.vmp);
              const size = w.dcSizeMm2 ?? pickCable((sz) => dcVoltageDrop(len / 2, moduleModel.imp, sz, vStr).pct, 1.5);
              const d = dcVoltageDrop(len / 2, moduleModel.imp, size, vStr);
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: STRING_COLORS[i % STRING_COLORS.length] }} />{s.id}</td>
                  <td>{fmtLen(len, units, 0)}</td>
                  <td>{size} mm²</td>
                  <td className={clsx("text-right", d.pct > 1.5 ? "text-red-600" : "text-teal-700")}>{d.pct.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="rounded-lg border border-slate-200 p-2 text-xs">
        <NumField label="AC run (inverter → ACDB/meter)" value={w.acRunM} onChange={(v) => onWiring({ acRunM: Math.max(1, v) })} unit="m" step={1} />
        <label className="flex items-center justify-between py-1"><span className="text-slate-600">DC cable size</span>
          <select value={w.dcSizeMm2 ?? ""} onChange={(e) => onWiring({ dcSizeMm2: e.target.value ? Number(e.target.value) : null })} className="rounded border border-slate-200 px-1 py-0.5"><option value="">Auto (≤1.5%)</option>{[4, 6, 10].map((s) => <option key={s} value={s}>{s} mm²</option>)}</select>
        </label>
        <label className="flex items-center justify-between py-1"><span className="text-slate-600">AC cable size</span>
          <select value={w.acSizeMm2 ?? ""} onChange={(e) => onWiring({ acSizeMm2: e.target.value ? Number(e.target.value) : null })} className="rounded border border-slate-200 px-1 py-0.5"><option value="">Auto (≤2%)</option>{[2.5, 4, 6, 10, 16].map((s) => <option key={s} value={s}>{s} mm²</option>)}</select>
        </label>
        {totalAc > 0 && <div className="mt-1 text-slate-600">AC: {ac.current.toFixed(1)} A · {acSize} mm² · drop <b className={ac.pct > 2 ? "text-red-600" : "text-teal-700"}>{ac.pct.toFixed(2)}%</b></div>}
      </div>
      {totalDc > 0 && (
        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          <div className="font-semibold text-slate-700">Bill of materials (cable)</div>
          <div>DC solar cable: {fmtLen(totalDc, units, 0)} total (red + black), +10% spare ≈ {fmtLen(totalDc * 1.1, units, 0)}</div>
          <div>AC cable: {fmtLen(w.acRunM * 1.1, units, 0)} incl. 10% spare</div>
          <div>MC4 connector pairs: {strings.length * 2}</div>
        </div>
      )}
    </fieldset>
  );
}

function ModulePicker({ custom, current, onPick, onAddCustom, onClose }: { custom: ModuleModel[]; current?: string; onPick: (m: ModuleModel) => void; onAddCustom: (m: ModuleModel) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [dcr, setDcr] = useState(false);
  const [adding, setAdding] = useState(false);
  const all = [...custom, ...MODULES];
  const list = all.filter((m) => (!dcr || m.dcr) && `${m.brand} ${m.model} ${m.watt} ${m.tech}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Choose module" onClose={onClose} wide>
      {adding ? (
        <CustomForm
          fields={[["brand", "Brand", "text"], ["model", "Model", "text"], ["watt", "Power (Wp)"], ["length", "Length (mm)"], ["width", "Width (mm)"], ["voc", "Voc (V)"], ["isc", "Isc (A)"], ["vmp", "Vmp (V)"], ["imp", "Imp (A)"], ["tempCoeffVoc", "Temp coeff Voc (%/°C)"], ["tempCoeffPmax", "Temp coeff Pmax (%/°C)"]]}
          defaults={{ brand: "", model: "", watt: 540, length: 2278, width: 1134, voc: 49.6, isc: 13.86, vmp: 41.6, imp: 12.98, tempCoeffVoc: -0.27, tempCoeffPmax: -0.35 }}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            const m: ModuleModel = { id: uid("cm-"), brand: String(v.brand || "Custom"), model: String(v.model || `${v.watt} Wp`), tech: "Mono PERC", dcr: false, watt: +v.watt, length: +v.length, width: +v.width, voc: +v.voc, isc: +v.isc, vmp: +v.vmp, imp: +v.imp, tempCoeffVoc: +v.tempCoeffVoc, tempCoeffPmax: +v.tempCoeffPmax, efficiency: Math.round((+v.watt / ((+v.length / 1000) * (+v.width / 1000) * 1000)) * 1000) / 10, custom: true };
            onAddCustom(m);
            onPick(m);
          }}
        />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <input autoFocus placeholder="Search brand, model, wattage…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={dcr} onChange={(e) => setDcr(e.target.checked)} /> DCR only</label>
            <button onClick={() => setAdding(true)} className="rounded-md border border-teal-600 px-3 text-sm font-medium text-teal-700">+ Custom</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Module</th><th>Wp</th><th>Size (mm)</th><th>Eff.</th><th>Voc/Isc</th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} onClick={() => onPick(m)} className={clsx("cursor-pointer border-t border-slate-100 hover:bg-teal-50", current === m.id && "bg-teal-50")}>
                  <td className="py-1.5"><div className="font-medium">{m.brand} {m.model}</div><div className="text-xs text-slate-500">{m.tech}{m.dcr && <span className="ml-1 rounded bg-green-100 px-1 text-green-700">DCR</span>}{m.custom && <span className="ml-1 rounded bg-slate-100 px-1">custom</span>}</div></td>
                  <td>{m.watt}</td><td className="text-xs">{m.length}×{m.width}</td><td>{m.efficiency}%</td><td className="text-xs">{m.voc} V / {m.isc} A</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-400">Typical datasheet values. Check them against the datasheet of the lot you install, or add a custom module.</p>
        </>
      )}
    </Modal>
  );
}

function InverterPicker({ custom, systemKw, onPick, onAddCustom, onClose }: { custom: InverterModel[]; systemKw: number; onPick: (i: InverterModel) => void; onAddCustom: (i: InverterModel) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<"all" | "single" | "three">("all");
  const [adding, setAdding] = useState(false);
  const list = [...custom, ...INVERTERS].filter((i) => (phase === "all" || i.phase === phase) && `${i.brand} ${i.model} ${i.acKw}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Add inverter" onClose={onClose} wide>
      {adding ? (
        <CustomForm
          fields={[["brand", "Brand", "text"], ["model", "Model", "text"], ["acKw", "AC power (kW)"], ["maxDcKw", "Max DC power (kW)"], ["maxDcV", "Max DC voltage (V)"], ["mpptMinV", "MPPT min (V)"], ["mpptMaxV", "MPPT max (V)"], ["startV", "Start voltage (V)"], ["mppts", "MPPTs"], ["stringsPerMppt", "Strings per MPPT"], ["maxIscPerMppt", "Max Isc per MPPT (A)"]]}
          defaults={{ brand: "", model: "", acKw: 5, maxDcKw: 7.5, maxDcV: 600, mpptMinV: 80, mpptMaxV: 550, startV: 100, mppts: 2, stringsPerMppt: 1, maxIscPerMppt: 16 }}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            const iv: InverterModel = { id: uid("ci-"), brand: String(v.brand || "Custom"), model: String(v.model || `${v.acKw} kW`), phase: +v.acKw > 6 ? "three" : "single", acKw: +v.acKw, maxDcKw: +v.maxDcKw, maxDcV: +v.maxDcV, mpptMinV: +v.mpptMinV, mpptMaxV: +v.mpptMaxV, startV: +v.startV, mppts: Math.max(1, Math.round(+v.mppts)), stringsPerMppt: Math.max(1, Math.round(+v.stringsPerMppt)), maxIscPerMppt: +v.maxIscPerMppt, custom: true };
            onAddCustom(iv);
            onPick(iv);
          }}
        />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm" />
            <select value={phase} onChange={(e) => setPhase(e.target.value as typeof phase)} className="rounded-md border border-slate-200 px-2 text-sm"><option value="all">All</option><option value="single">1-phase</option><option value="three">3-phase</option></select>
            <button onClick={() => setAdding(true)} className="rounded-md border border-teal-600 px-3 text-sm font-medium text-teal-700">+ Custom</button>
          </div>
          <p className="mb-2 text-xs text-slate-500">Array: {systemKw} kWp → suitable AC size {(systemKw / 1.3).toFixed(1)}–{systemKw.toFixed(1)} kW</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Inverter</th><th>AC kW</th><th>MPPT window</th><th>Max V</th><th>MPPTs</th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} onClick={() => onPick(i)} className="cursor-pointer border-t border-slate-100 hover:bg-teal-50">
                  <td className="py-1.5"><div className="font-medium">{i.brand} {i.model}</div><div className="text-xs text-slate-500">{i.phase === "single" ? "1-phase" : "3-phase"}</div></td>
                  <td>{i.acKw}</td><td className="text-xs">{i.mpptMinV}–{i.mpptMaxV} V</td><td>{i.maxDcV}</td><td>{i.mppts}×{i.stringsPerMppt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

function CustomForm({ fields, defaults, onSave, onCancel }: { fields: (readonly [string, string] | readonly [string, string, "text"])[]; defaults: Record<string, string | number>; onSave: (v: Record<string, string | number>) => void; onCancel: () => void }) {
  const [v, setV] = useState(defaults);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([k, l, t]) => (
          <label key={k} className="text-xs text-slate-600">{l}
            <input type={t === "text" ? "text" : "number"} step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: t === "text" ? e.target.value : Number(e.target.value) })} className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">Back</button>
        <button onClick={() => onSave(v)} className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white">Save & use</button>
      </div>
    </div>
  );
}

function DroneModal({ overlay, onSet, onOpacity, onRemove, onClose }: { overlay: DesignData["overlay"] | null; onSet: (url: string) => void; onOpacity: (o: number) => void; onRemove: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const onFile = async (f: File) => {
    setBusy(true);
    try {
      // Downscale to ≤ 2048 px JPEG so the design stays light to save and load.
      const img = await createImageBitmap(f);
      const k = Math.min(1, 2048 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      onSet(c.toDataURL("image/jpeg", 0.82));
      toast.success("Drone image placed. Drag its two corner handles to line it up with the map");
      onClose();
    } catch {
      toast.error("Couldn't read that image");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Drone View" onClose={onClose}>
      <p className="text-sm text-slate-600">Upload a top-down drone photo or orthomosaic of the roof. It&apos;s laid over the satellite map so you can trace zones and blockers on sharper, up-to-date imagery.</p>
      <label className="mt-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm text-slate-500 hover:border-teal-500">
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plane className="h-6 w-6" />}
        <span className="mt-2 font-medium">{overlay ? "Replace image" : "Choose image (JPG/PNG)"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {overlay && (
        <div className="mt-4 space-y-2">
          <label className="block text-sm text-slate-600">Opacity
            <input type="range" min={0.1} max={1} step={0.05} value={overlay.opacity} onChange={(e) => onOpacity(Number(e.target.value))} className="sun-range w-full" />
          </label>
          <button onClick={() => { onRemove(); onClose(); }} className="text-sm text-red-600 hover:underline">Remove drone image</button>
        </div>
      )}
    </Modal>
  );
}

function ResultsView({ r, climate }: { r: AnalysisResult; climate: Climate }) {
  const maxKwh = Math.max(...r.monthlyKwh, 1);
  const worst = [...r.panels].sort((a, b) => a.solarAccess - b.solarAccess).slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Shading loss", `${r.shadingLossPct.toFixed(1)}%`, "electrical, incl. bypass-diode mismatch"],
          ["Area-only loss", `${r.geometricLossPct.toFixed(1)}%`, "what simple tools report"],
          ["Annual energy", `${Math.round(r.annualKwh).toLocaleString("en-IN")} kWh`, `${r.systemKw.toFixed(2)} kWp`],
          ["Specific yield", `${Math.round(r.specificYield)} kWh/kWp`, "per year"],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-lg font-bold text-slate-800">{v}</div><div className="text-[11px] text-slate-400">{s}</div></div>
        ))}
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">Monthly generation & shading loss</div>
        <div className="flex h-36 items-end gap-1.5">
          {r.monthlyKwh.map((k, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="text-[10px] text-red-500">{r.monthlyLossPct[i] >= 0.05 ? `${r.monthlyLossPct[i].toFixed(1)}%` : ""}</div>
              <div className="w-full rounded-t bg-teal-500" style={{ height: `${(k / maxKwh) * 100}px` }} title={`${Math.round(k)} kWh`} />
              <div className="text-[10px] text-slate-500">{MONTHS[i]}</div>
            </div>
          ))}
        </div>
      </div>
      {worst.length > 0 && worst[0].solarAccess < 0.98 && (
        <div>
          <div className="mb-1 text-sm font-semibold">Most shaded modules</div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th>Module</th><th>Solar access</th><th>Area-only</th><th>Sky view</th><th className="text-right">kWh/yr</th></tr></thead>
            <tbody>{worst.map((p) => <tr key={p.index} className="border-t border-slate-100"><td className="py-1">{p.key}</td><td style={{ color: accessColor(p.solarAccess) }} className="font-semibold">{(p.solarAccess * 100).toFixed(1)}%</td><td>{(p.geometricAccess * 100).toFixed(1)}%</td><td>{(p.skyView * 100).toFixed(0)}%</td><td className="text-right">{Math.round(p.annualKwh)}</td></tr>)}</tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">Tip: modules below ~80% usually cost more than they earn on a string inverter. Remove or move them, or use optimisers/micro-inverters.</p>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Method: NOAA sun position every 30 min on a representative day each month · 3D ray-traced shadows from blockers, parapets and other rows · 3 bypass-diode substrings per module · sky-view-reduced diffuse light · weather from {climate?.source ?? "default clearness 0.75 (weather service unavailable)"} · performance ratio applied for inverter, temperature, wiring and soiling losses.
      </p>
    </div>
  );
}
