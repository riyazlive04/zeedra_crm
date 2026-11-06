import type { DesignData, PanelGeom, Scene } from "@/lib/solar/shading";

export type Tool = "select" | "zone" | "rect" | "polygon" | "circle" | "tree" | "inverter" | "string" | "addPanel";

export type Selection = { type: "zone" | "blocker"; id: string } | null;

export const panelId = (p: PanelGeom) => `${p.zoneId}|${p.key}`;

/** Wiring order: zone by zone, row by row, alternating direction (snake) to keep jumpers short. */
export function wiringOrder(scene: Scene, design: DesignData): string[] {
  const out: string[] = [];
  for (const z of design.zones) {
    const ps = scene.panels.filter((p) => p.zoneId === z.id && !p.removed);
    const rows = new Map<number, PanelGeom[]>();
    for (const p of ps) {
      if (p.free) continue;
      const [r] = p.key.split(":").map(Number);
      rows.set(r, [...(rows.get(r) ?? []), p]);
    }
    [...rows.keys()].sort((a, b) => a - b).forEach((r, i) => {
      const row = rows.get(r)!.sort((a, b) => Number(a.key.split(":")[1]) - Number(b.key.split(":")[1]));
      (i % 2 ? row.reverse() : row).forEach((p) => out.push(panelId(p)));
    });
    // Hand-placed modules go last, nearest-neighbour from the end of the grid to keep cable short.
    const free = ps.filter((p) => p.free);
    let last = ps.find((p) => panelId(p) === out[out.length - 1]) ?? free[0];
    while (free.length) {
      free.sort((a, b) => Math.hypot(a.center.x - last.center.x, a.center.y - last.center.y) - Math.hypot(b.center.x - last.center.x, b.center.y - last.center.y));
      last = free.shift()!;
      out.push(panelId(last));
    }
  }
  return out;
}

export const FT = 3.28084;

export function fmtLen(m: number, units: "m" | "ft" = "m", digits = 1) {
  return units === "ft" ? `${(m * FT).toFixed(digits)} ft` : `${m.toFixed(digits)} m`;
}
export function fmtArea(m2: number, units: "m" | "ft" = "m") {
  return units === "ft" ? `${(m2 * FT * FT).toFixed(0)} ft²` : `${m2.toFixed(2)} m²`;
}

export const STRING_COLORS = ["#f97316", "#06b6d4", "#a855f7", "#ec4899", "#22c55e", "#eab308", "#3b82f6", "#ef4444", "#14b8a6", "#8b5cf6"];

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

/** Day-of-year (0-based) → { month, day } in a non-leap year. */
export function doyToDate(doy: number) {
  const d = new Date(Date.UTC(2025, 0, 1) + doy * 86400000);
  return { month: d.getUTCMonth(), day: d.getUTCDate() };
}
export function dateToDoy(month: number, day: number) {
  return Math.round((Date.UTC(2025, month, day) - Date.UTC(2025, 0, 1)) / 86400000);
}
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtClock(h: number) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const ap = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}
