/** Schematic (not simulated) panel-array layout — a grid shape to illustrate roughly how the
 * panel count fills a roof. This is not a shading survey or satellite roof model. */
export interface PanelGrid {
  rows: number;
  cols: number;
  panelCount: number;
  totalCells: number;
}

export function panelGrid(panelCount: number): PanelGrid {
  if (!panelCount || panelCount <= 0) return { rows: 0, cols: 0, panelCount: 0, totalCells: 0 };
  // Roof arrays are usually wider than tall; bias columns accordingly.
  const cols = Math.max(1, Math.ceil(Math.sqrt(panelCount * 1.5)));
  const rows = Math.max(1, Math.ceil(panelCount / cols));
  return { rows, cols, panelCount, totalCells: rows * cols };
}
