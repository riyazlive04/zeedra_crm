import { panelGrid } from "@/lib/solar/layout";

// One module, drawn portrait like a real ~2.3 m × 1.1 m panel: silver frame, dark-blue cells.
const MOD_W = 20;
const MOD_H = 38;
const GAP = 3;
const CELL_COLS = 4;
const CELL_ROWS = 8;
const FRAME = 1.2;

function Module({ x, y }: { x: number; y: number }) {
  const iw = MOD_W - FRAME * 2;
  const ih = MOD_H - FRAME * 2;
  const cw = iw / CELL_COLS;
  const ch = ih / CELL_ROWS;
  const lines: React.ReactNode[] = [];
  for (let c = 1; c < CELL_COLS; c++) lines.push(<line key={`c${c}`} x1={x + FRAME + c * cw} x2={x + FRAME + c * cw} y1={y + FRAME} y2={y + MOD_H - FRAME} />);
  for (let r = 1; r < CELL_ROWS; r++) lines.push(<line key={`r${r}`} x1={x + FRAME} x2={x + MOD_W - FRAME} y1={y + FRAME + r * ch} y2={y + FRAME + r * ch} />);
  return (
    <g>
      <rect x={x} y={y} width={MOD_W} height={MOD_H} rx={1} fill="url(#pv-frame)" />
      <rect x={x + FRAME} y={y + FRAME} width={iw} height={ih} fill="url(#pv-cells)" />
      <g stroke="#c7d2fe" strokeOpacity={0.35} strokeWidth={0.35}>
        {lines}
      </g>
      {/* busbars */}
      <g stroke="#e2e8f0" strokeOpacity={0.25} strokeWidth={0.25}>
        {Array.from({ length: CELL_COLS }, (_, c) => (
          <line key={c} x1={x + FRAME + (c + 0.5) * cw} x2={x + FRAME + (c + 0.5) * cw} y1={y + FRAME} y2={y + MOD_H - FRAME} />
        ))}
      </g>
      <rect x={x + FRAME} y={y + FRAME} width={iw} height={ih} fill="url(#pv-glare)" />
    </g>
  );
}

/** The panel count drawn as real modules on a roof — illustrative only, not a shading or roof survey. */
export function PanelLayoutPreview({ panelCount, panelWattage, systemKw, className }: { panelCount: number; panelWattage?: number; systemKw?: number; className?: string }) {
  const g = panelGrid(panelCount);
  if (g.panelCount === 0) return null;
  const sx = MOD_W + GAP;
  const sy = MOD_H + GAP;
  const w = g.cols * sx - GAP;
  const h = g.rows * sy - GAP;

  const slots: { x: number; y: number; filled: boolean }[] = [];
  let n = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      slots.push({ x: c * sx, y: r * sy, filled: n < g.panelCount });
      n++;
    }
  }

  return (
    <div className={className}>
      <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} width="100%" style={{ maxWidth: Math.min(420, g.cols * 64) }} className="mx-auto block" role="img" aria-label={`${g.panelCount} solar panels`}>
        <defs>
          <linearGradient id="pv-cells" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1e3a8a" />
            <stop offset="0.55" stopColor="#172554" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="pv-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e5e7eb" />
            <stop offset="1" stopColor="#9ca3af" />
          </linearGradient>
          <linearGradient id="pv-glare" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="0.35" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={4} fill="#f1f5f9" />
        {slots.map((s, i) =>
          s.filled ? (
            <Module key={i} x={s.x} y={s.y} />
          ) : (
            <rect key={i} x={s.x} y={s.y} width={MOD_W} height={MOD_H} rx={1} fill="none" stroke="#cbd5e1" strokeWidth={0.8} strokeDasharray="2 2" />
          ),
        )}
      </svg>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        Layout: {g.panelCount} panel{g.panelCount === 1 ? "" : "s"}
        {panelWattage ? ` × ${panelWattage} Wp` : ""}
        {systemKw ? ` (${systemKw} kWp)` : ""}. Illustrative, not a shading or roof survey.
      </p>
    </div>
  );
}
