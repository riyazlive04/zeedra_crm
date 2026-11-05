// Custom quotation templates: an organisation's own quotation design stored as HTML with
// {{placeholders}}, filled from a quotation at render time. Pure (client + server safe).
import type { QuotifySnapshot } from "./solar/quotify";

/** Every value a template can use. Shown to admins and given to the PDF converter. */
export const TEMPLATE_FIELDS: { key: string; label: string; sample: string }[] = [
  { key: "quote.number", label: "Quotation number", sample: "ZS/2026/0142" },
  { key: "quote.version", label: "Revision number", sample: "1" },
  { key: "quote.date", label: "Quotation date", sample: "05 Nov 2026" },
  { key: "quote.validUntil", label: "Valid until", sample: "05 Dec 2026" },
  { key: "quote.title", label: "System title", sample: "3.24 kW On-Grid Solar Power System (DCR)" },
  { key: "company.name", label: "Your company name", sample: "Zeedra Solar Solutions" },
  { key: "company.address", label: "Your address", sample: "12, Anna Salai, Chennai 600002" },
  { key: "company.phone", label: "Your phone", sample: "+91 98400 12345" },
  { key: "company.gstin", label: "Your GSTIN", sample: "33ABCDE1234F1Z5" },
  { key: "company.logoUrl", label: "Logo image URL", sample: "" },
  { key: "company.signatory", label: "Authorised signatory", sample: "R. Kumar" },
  { key: "company.bank", label: "Bank details", sample: "HDFC Bank · A/c 50100123456789 · IFSC HDFC0001234" },
  { key: "customer.name", label: "Customer name", sample: "Ravi Kumar" },
  { key: "customer.phone", label: "Customer phone", sample: "+91 98765 43210" },
  { key: "customer.address", label: "Customer address", sample: "45, Gandhi Street, T. Nagar, Chennai" },
  { key: "customer.pincode", label: "Customer pincode", sample: "600017" },
  { key: "customer.ebNumber", label: "EB consumer number", sample: "09-123-456-789" },
  { key: "system.kw", label: "System size (kW)", sample: "3.24" },
  { key: "system.panels", label: "Number of panels", sample: "6" },
  { key: "system.panelWatt", label: "Panel wattage (W)", sample: "540" },
  { key: "system.panelBrand", label: "Panel brand", sample: "Waaree" },
  { key: "system.inverter", label: "Inverter", sample: "3 kW single-phase on-grid" },
  { key: "system.inverterBrand", label: "Inverter brand", sample: "Growatt" },
  { key: "system.type", label: "System type", sample: "On-Grid (DCR)" },
  { key: "system.structure", label: "Structure", sample: "Low-rise GI structure" },
  { key: "price.subTotal", label: "Sub total before GST", sample: "₹1,72,500" },
  { key: "price.gst", label: "GST amount", sample: "₹15,525" },
  { key: "price.total", label: "Grand total", sample: "₹1,88,025" },
  { key: "price.centralSubsidy", label: "Central subsidy", sample: "₹78,000" },
  { key: "price.stateSubsidy", label: "State subsidy", sample: "₹0" },
  { key: "price.subsidy", label: "Total subsidy", sample: "₹78,000" },
  { key: "price.netCost", label: "Net cost after subsidy", sample: "₹1,10,025" },
  { key: "savings.monthly", label: "Monthly savings", sample: "₹2,640" },
  { key: "savings.annual", label: "Yearly savings", sample: "₹31,680" },
  { key: "savings.payback", label: "Payback (years)", sample: "3.5" },
  { key: "savings.units", label: "Units generated per year", sample: "4,730" },
];

/** Line items are available as a list: {{#each items}} … {{/each}}. */
export const ITEM_FIELDS: { key: string; label: string }[] = [
  { key: "no", label: "Row number" },
  { key: "content", label: "Item" },
  { key: "description", label: "Description" },
  { key: "make", label: "Make / brand" },
  { key: "qty", label: "Quantity" },
  { key: "uom", label: "Unit (Nos, Set, kW…)" },
  { key: "rate", label: "Unit price" },
  { key: "amount", label: "Amount before GST" },
  { key: "gst", label: "GST" },
  { key: "total", label: "Line total" },
];

/** Payment schedule: {{#each payments}} {{name}} {{pct}} {{amount}} {{when}} {{/each}} */
export const PAYMENT_FIELDS = ["name", "pct", "amount", "when"];

type Ctx = Record<string, unknown>;

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export interface QuoteMeta {
  number: string;
  version: number;
  createdAt: Date;
  validityDays: number;
  company: { name: string; address: string | null; phone: string | null; gstin: string | null; logoUrl: string | null; signatoryName?: string | null; bank?: unknown };
}

/** Builds the values a template is filled with, from a saved quotation. */
export function templateContext(snap: QuotifySnapshot, meta: QuoteMeta): Ctx {
  const r = snap.result;
  const bank = meta.company.bank as { name?: string; branch?: string; accNo?: string; ifsc?: string } | null | undefined;
  const bankLine = bank ? [bank.name, bank.branch, bank.accNo ? `A/c ${bank.accNo}` : "", bank.ifsc ? `IFSC ${bank.ifsc}` : ""].filter(Boolean).join(" · ") : "";
  const valid = new Date(meta.createdAt.getTime() + meta.validityDays * 86400000);
  return {
    quote: { number: meta.number, version: meta.version, date: fmtDate(meta.createdAt), validUntil: fmtDate(valid), title: r.title },
    company: { name: meta.company.name, address: meta.company.address ?? "", phone: meta.company.phone ?? "", gstin: meta.company.gstin ?? "", logoUrl: meta.company.logoUrl ?? "", signatory: meta.company.signatoryName ?? "", bank: bankLine },
    customer: { ...snap.customer },
    system: {
      kw: r.actualKw, panels: r.panels, panelWatt: r.panelWatt, panelBrand: r.brands.panel, inverter: r.inverterLabel,
      inverterBrand: r.brands.inverter, type: r.sysLabel, structure: r.structLabel,
    },
    price: {
      subTotal: inr(r.preTax), gst: inr(r.gst), total: inr(r.grandTotal), centralSubsidy: inr(r.centralSubsidy),
      stateSubsidy: inr(r.stateSubsidy), subsidy: inr(r.subsidy), netCost: inr(r.netCost),
    },
    savings: {
      monthly: inr(r.savings.monthlySave), annual: inr(r.savings.annualSave), payback: r.savings.paybackYrs.toFixed(1),
      units: Math.round(r.savings.annualUnits).toLocaleString("en-IN"),
    },
    items: r.rows.map((row, i) => ({
      no: i + 1, content: row.content, description: row.desc, make: row.make, qty: row.qty, uom: row.uom,
      rate: row.incl ? "Included" : inr(row.unit), amount: row.incl ? "Included" : inr(row.sub), gst: row.incl ? "" : inr(row.gstAmt), total: row.incl ? "Included" : inr(row.total),
    })),
    payments: snap.paymentStages.map((p) => ({ name: p.name, pct: `${p.pct}%`, amount: inr((r.grandTotal * p.pct) / 100), when: p.when })),
  };
}

/** Sample values for previewing a template before any real quotation exists. */
export function sampleContext(): Ctx {
  const ctx: Ctx = {};
  for (const f of TEMPLATE_FIELDS) setPath(ctx, f.key, f.sample);
  ctx.items = [
    { no: 1, content: "Solar PV modules", description: "540 Wp mono PERC, DCR", make: "Waaree", qty: 6, uom: "Nos", rate: "₹16,200", amount: "₹97,200", gst: "₹8,748", total: "₹1,05,948" },
    { no: 2, content: "On-grid inverter", description: "3 kW single-phase", make: "Growatt", qty: 1, uom: "Nos", rate: "₹32,000", amount: "₹32,000", gst: "₹5,760", total: "₹37,760" },
    { no: 3, content: "Mounting structure", description: "GI low-rise", make: "Standard", qty: 1, uom: "Set", rate: "₹22,000", amount: "₹22,000", gst: "₹1,980", total: "₹23,980" },
    { no: 4, content: "Installation & net metering", description: "Labour, earthing, DISCOM liaison", make: "-", qty: 1, uom: "Job", rate: "Included", amount: "Included", gst: "", total: "Included" },
  ];
  ctx.payments = [
    { name: "Advance", pct: "40%", amount: "₹75,210", when: "On order confirmation" },
    { name: "On delivery", pct: "50%", amount: "₹94,013", when: "When material reaches site" },
    { name: "Commissioning", pct: "10%", amount: "₹18,802", when: "After installation" },
  ];
  return ctx;
}

function setPath(obj: Ctx, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Ctx;
  cur[parts[parts.length - 1]] = value;
}

function getPath(scopes: Ctx[], path: string): unknown {
  const p = path.replace(/^this\./, "");
  if (p === "this") return scopes[0];
  for (const scope of scopes) {
    let cur: unknown = scope;
    let ok = true;
    for (const part of p.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Ctx)) cur = (cur as Ctx)[part];
      else { ok = false; break; }
    }
    if (ok) return cur;
  }
  return undefined;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Fills a template. Supports {{path}} (HTML-escaped), {{#each list}}…{{/each}} (nested scopes,
 * {{@index}} is 1-based), and {{#if path}}…{{else}}…{{/if}}. Unknown placeholders render empty.
 */
export function renderQuoteTemplate(html: string, ctx: Ctx): string {
  return renderBlock(html, [ctx]);
}

function renderBlock(tpl: string, scopes: Ctx[]): string {
  let out = "";
  let i = 0;
  const open = /\{\{#(each|if)\s+([\w.@]+)\s*\}\}/g;
  while (i < tpl.length) {
    open.lastIndex = i;
    const m = open.exec(tpl);
    if (!m) {
      out += renderVars(tpl.slice(i), scopes);
      break;
    }
    out += renderVars(tpl.slice(i, m.index), scopes);
    const kind = m[1], path = m[2];
    const bodyStart = m.index + m[0].length;
    const end = findClose(tpl, bodyStart, kind);
    if (!end) {
      // Unbalanced block: render the rest literally rather than failing.
      out += renderVars(tpl.slice(m.index), scopes);
      break;
    }
    const body = tpl.slice(bodyStart, end.start);
    const value = getPath(scopes, path);
    if (kind === "each") {
      if (Array.isArray(value)) out += value.map((item, idx) => renderBlock(body, [{ ...(item as Ctx), "@index": idx + 1 }, ...scopes])).join("");
    } else {
      const [yes, no = ""] = splitElse(body);
      const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value) && value !== "0" && value !== "₹0";
      out += renderBlock(truthy ? yes : no, scopes);
    }
    i = end.end;
  }
  return out;
}

function findClose(tpl: string, from: number, kind: string): { start: number; end: number } | null {
  const re = new RegExp(`\\{\\{(#${kind}\\s+[\\w.@]+|/${kind})\\s*\\}\\}`, "g");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m[1].startsWith("#")) depth++;
    else if (--depth === 0) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function splitElse(body: string): [string, string?] {
  // Only a top-level {{else}} splits the block.
  let depth = 0;
  const re = /\{\{(#if\s+[\w.@]+|\/if|else)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1].startsWith("#if")) depth++;
    else if (m[1] === "/if") depth--;
    else if (depth === 0) return [body.slice(0, m.index), body.slice(m.index + m[0].length)];
  }
  return [body];
}

function renderVars(s: string, scopes: Ctx[]): string {
  return s.replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (_, path: string) => {
    if (path === "else") return "";
    const v = getPath(scopes, path);
    return v === undefined || v === null || typeof v === "object" ? "" : escapeHtml(String(v));
  });
}

/**
 * Removes anything executable from a template: scripts, event handlers, javascript: URLs, embeds,
 * forms and meta refreshes. Templates are also shown in a sandboxed frame, so this is a second line.
 */
export function sanitizeTemplate(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*>/gi, "")
    .replace(/<(iframe|object|embed|frame|frameset|applet|form|base)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(iframe|object|embed|frame|frameset|applet|form|base)\b[^>]*>/gi, "")
    .replace(/<meta[^>]+http-equiv[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action|xlink:href)\s*=\s*(["'])\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"')
    .replace(/expression\s*\(/gi, "(");
}

/** Placeholders used in a template that the system doesn't know (likely typos). */
export function unknownPlaceholders(html: string): string[] {
  const known = new Set([...TEMPLATE_FIELDS.map((f) => f.key), ...ITEM_FIELDS.map((f) => f.key), ...PAYMENT_FIELDS, "@index", "this", "else", "items", "payments"]);
  const found = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*(?:#each\s+|#if\s+)?([\w.@]+)\s*\}\}/g)) {
    const k = m[1].replace(/^this\./, "");
    if (!known.has(k) && !k.startsWith("/")) found.add(k);
  }
  return [...found];
}
