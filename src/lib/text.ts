/** Normalise Indian mobile numbers to 91XXXXXXXXXX (WhatsApp Cloud API format). */
export function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits[1])) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits[2])) return digits;
  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith("0")) return digits; // international
  return null;
}

export function displayPhone(p: string): string {
  if (p.length === 12 && p.startsWith("91")) return `+91 ${p.slice(2, 7)} ${p.slice(7)}`;
  return `+${p}`;
}

/** Render a template like "Hi {{name}}, your {{kw}} kW system…". Unknown variables render as empty. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

export function templateVariables(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g), (m) => m[1])));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatINR = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "—" : inr.format(n));

/** ₹1.2 L / ₹3.4 Cr compact Indian notation for dashboards. */
export function formatINRCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export const formatNumber = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits });

export function humanize(v: string | null | undefined): string {
  if (!v) return "—";
  return v
    .toLowerCase()
    .split("_")
    .map((w) => (w === "to" || w === "of" ? w : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\b1 Month\b/, "1 Month")
    .replace("One To 3", "1–3")
    .replace("Three To 6", "3–6");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}
