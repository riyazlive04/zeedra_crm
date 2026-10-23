import { panelGrid } from "@/lib/solar/layout";

/** A schematic grid of the panel count — illustrative only, not a shading or roof survey. */
export function PanelLayoutPreview({ panelCount, panelWattage, systemKw, className }: { panelCount: number; panelWattage?: number; systemKw?: number; className?: string }) {
  const g = panelGrid(panelCount);
  if (g.panelCount === 0) return null;
  const cell = 22;
  const gap = 3;
  const step = cell + gap;
  const w = g.cols * step - gap;
  const h = g.rows * step - gap;

  const cells: { x: number; y: number; filled: boolean }[] = [];
  let n = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      cells.push({ x: c * step, y: r * step, filled: n < g.panelCount });
      n++;
    }
  }

  return (
    <div className={className}>
      <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} width="100%" style={{ maxWidth: 360 }} className="mx-auto block">
        {cells.map((cell_, i) => (
          <rect
            key={i}
            x={cell_.x}
            y={cell_.y}
            width={cell}
            height={cell}
            rx={2}
            className={cell_.filled ? "fill-sun-400/80 stroke-sun-600" : "fill-transparent stroke-slate-200"}
            strokeWidth={1}
          />
        ))}
      </svg>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        Schematic layout — {g.panelCount} panel{g.panelCount === 1 ? "" : "s"}
        {panelWattage ? ` × ${panelWattage} Wp` : ""}
        {systemKw ? ` (${systemKw} kWp)` : ""}. Not a shading or roof survey.
      </p>
    </div>
  );
}
