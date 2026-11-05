/**
 * Consumer–Vendor agreement for grid-connected rooftop solar under PM Surya Ghar (MNRE Annex 2),
 * made once a quotation is accepted. Ported from the production quotation app: the standard text,
 * the details filled in for each customer, the payment schedule and the block structure the
 * pages are laid out from. Pure functions, safe on both client and server.
 */

import type { OrgSettings } from "../settings";

export const AGR_TEXT = [
  "# Agreement between Consumer & Vendor for installation of grid connected rooftop solar (RTS) project under PM – Surya Ghar: Muft Bijli Yojana",
  "This agreement is executed on {date} for design, supply, installation, commissioning and 5-year comprehensive maintenance of RTS project/system along with warranty under PM Surya Ghar: Muft Bijli Yojana",
  "## Between",
  "**{customer_name}** having address at {customer_address} (hereinafter referred to as first Party i.e. consumer /purchaser /owner of system).",
  "## And",
  "**{vendor_name}** having its registered office at {vendor_address} (hereinafter referred to as second Party i.e. Vendor/ contractor/System Integrator).",
  "### Whereas",
  "First Party wishes to install a Grid Connected Rooftop Solar Plant on the rooftop of the residential building of the Consumer under PM Surya Ghar: Muft Bijli Yojana.",
  "### And whereas",
  "Second Party has verified availability of appropriate roof and found it feasible to install a Grid Connected Roof Top Solar plant and that the second party is willing to design, supply, install, test, commission and carry out Operation & Maintenance of the Rooftop Solar plant for 5 year period.",
  "On this day, the First Party and Second Party agree to the following",
  "### The First Party hereby undertake to perform the following activities:",
  "- Submission of online application at National Portal for installation of RTS project/system, Submission of application for net-metering and system inspection and upload of the relevant documents on the National Portal of the scheme.",
  "- Provide secure storage of the material of the RTS plant delivered at the premises till handover of the system.",
  "- Provide access to the Roof Top during installation of the plant, operation & maintenance, testing of the plant and equipment and for meter reading from solar meter, inverter etc.",
  "- Provide electricity during plant installation and water for cleaning of the panels.",
  "- Report any malfunctioning of the plant to the Vendor during the warranty period.",
  "- Pay the amount as per the payment schedule as mutually agreed with the vendor, including any additional amount to the second party for any additional work /customization required depending upon the building condition.",
  "### The Second Party hereby undertakes to perform the following activities:",
  "- The Vendor must follow all the standards and safety guidelines prescribed under state regulations and technical standards prescribed by MNRE for RTS projects, failing which the vendor is liable for blacklisting from participation in the govt. project/ scheme and other penal actions in accordance with the law. The responsibility of supply, installation and commissioning of the rooftop solar project/system in complete compliance with MNRE scheme guidelines lies with the Vendor.",
  "- **Site Survey:** Site visit, survey and development of detailed project report for installation of RTS system. This also includes, feasibility study of roof, strength of roof and shadow free area. If any additional work or customization is involved for the plant installation as per site condition and requirement of the consumer building, the Vendor shall prepare an estimate and can raise separate invoice including GST in addition to the amount towards standard plant cost. The consumer shall pay the amount for such additional work directly to the Vendor.",
  "- **Design & Engineering:** Design of plant along with drawings and selection of component as per standard provided by the DISCOM/SERC/MNRE for best performance and safety of the plant.",
  "- **Module and Inverter:** The solar modules, including the solar cells, should be manufactured in India. Both the solar modules and inverters shall conform to the relevant standards and specifications prescribed by MNRE. Any other requirement, viz. star labelling (solar modules), quality control orders and standards & labelling (inverters) etc., shall also be complied.",
  "- **Procurement & Supply:** Procurement of complete system as per BIS/IS/IEC standard (whatever applicable) & safety guidelines for installation of rooftop solar plants. The supplied materials should comply with all MNRE standards for release of subsidy.",
  "- **Installation & Civil work:** Complete civil work, structure work and electrical work (including drawings) following all the safety and relevant BIS standards.",
  "- **Documentation (Technical Catalogues/Warranty Certificates/BIS certificates/other test reports etc):** All such documents shall be provided to the consumer for online uploading and submission of technical specifications, IEC/BIS report, Sr. Nos, Warranty card of Solar Panel & Inverter, Layout & Electrical SLD, Structure Design and Drawing, Cable and other detailed documents.",
  "- **Project completion report (PCR):** Assisting the consumer in filling and uploading of signed documents (Consumer & Vendor) on the national portal.",
  "- **Warranty:** System warranty certificates should be provided to the consumer. The complete system should be warranted for 5 years from the date of commissioning by DISCOM. Individual component warranty documents provided by the manufacturer shall be provided to the consumer and all possible assistance should be extended to the consumer for claiming the warranty from the manufacturer.",
  "- **NET meter & Grid Connectivity:** Net meter supply/procurement, testing and approvals shall be in the scope of vendor. Grid connection of the plant shall be in the scope of the vendor.",
  "- **Testing and Commissioning:** The vendor shall be present at the time of testing and commissioning by the DISCOM.",
  "- **Operation & Maintenance:** Five (5) years Comprehensive Operation and Maintenance including overhauling, wear and tear and regular checking of healthiness of system at proper interval shall be in the scope of vendor. The vendor shall also educate the consumer on best practices for cleaning of the modules and system maintenance.",
  "- **Insurance:** Any insurance cost pertaining to material transfer/storage before commissioning of the system shall be in the scope of the vendor.",
  "- **Applicable Standard:** The system must meet the technical standards and specifications notified by MNRE. The vendor is solely responsible to supply component and service which meets the technical standards and specification prescribed by MNRE and State DISCOMs.",
  "- **Project/system cost & payment terms:** The cost of the plant and payment schedule should be mutually discussed and decided between the vendor and consumer. The consumer may opt for milestone-based payment to the vendor and the same shall be included in the agreement.",
  "- **Dispute:** In-case of any dispute between consumer and vendor (in supply/installation/maintenance of system or payment terms), both parties must settle the same mutually or as per law. MNRE/DISCOM shall not be liable for, and would not be a party to any dispute arising between vendor and consumer.",
  "- **Subsidy / Project Related Documents:** Vendor must provide all the documents to consumer and help in uploading the same to National Portal for smooth release of subsidy.",
  "- **Performance of Plant:** The Performance Ratio (PR) of Plant must be 75% at the time of commissioning of the project by DISCOM or its authorised agency. Vendor must provide (returnable basis) radiation sensor with valid calibration certificate of any NABL / International laboratory at the time of commissioning / testing of the plant. Vendor must maintain the PR of the plant till warranty of project i.e. 5 years from the date of commissioning.",
  "- **MUTUALLY AGREED TERMS OF PAYMENT**",
  "{payment_schedule}",
  "{signatures}",
  "> Disclaimer: This agreement is between vendor and consumer and any dispute related to the same shall not involve any third party including MNRE and Distribution Utilities",
].join("\n");

/** Details filled in for each customer: [placeholder, label on the tap-to-insert button]. */
export const AGR_FIELDS: [string, string][] = [
  ["date", "Agreement date"],
  ["customer_name", "Customer name"],
  ["father_name", "Father's / husband's name"],
  ["aadhaar", "Aadhaar number"],
  ["customer_address", "Customer address + PIN"],
  ["pincode", "PIN code"],
  ["eb_number", "EB consumer number"],
  ["system_kw", "System size (kW)"],
  ["total", "Total cost (₹)"],
  ["total_words", "Total cost in words"],
  ["vendor_name", "Your company name"],
  ["vendor_address", "Your company address"],
  ["payment_schedule", "Payment schedule (whole section)"],
  ["signatures", "Signatures (whole section)"],
];
/** These must sit on a line of their own. */
export const AGR_BLOCKS = ["payment_schedule", "signatures"];

export interface PaymentStage {
  name: string;
  pct: number;
  when: string;
}

/** Everything one agreement is made from — saved with it so it reopens exactly as it was. */
export interface AgreementData {
  date: string; // YYYY-MM-DD
  cust_name: string;
  cust_address: string;
  pincode: string;
  father: string;
  /** Saved as "XXXX XXXX 1234"; the full number exists only in the response that created it. */
  aadhaar: string;
  total: number;
  advance: number;
  stages: PaymentStage[];
  stamp: boolean;
  eb: string;
  kw: number | string;
  vendor_name: string;
  vendor_address: string;
  text: string;
}

export const stgTotal = (list: PaymentStage[]) => Math.round(list.reduce((t, st) => t + (Number(st.pct) || 0), 0) * 100) / 100;

export function stgProblem(list: PaymentStage[] | null | undefined): string {
  if (!list || !list.length) return "Add at least one payment stage.";
  if (list.some((st) => !st.name || !(st.pct > 0) || !st.when)) return "Fill every stage: name, percent and when it is paid.";
  if (stgTotal(list) !== 100) return "The stages must add up to 100% (now " + stgTotal(list) + "%).";
  return "";
}

/** The agreement text must keep both whole-section placeholders, each on a line of its own. */
export function agrTextProblem(text: string): string {
  const ownLine = (tag: string) => text.split("\n").some((l) => l.trim() === tag);
  return ownLine("{payment_schedule}") && ownLine("{signatures}") ? "" : "The agreement text must keep {payment_schedule} and {signatures}, each on a line of its own.";
}

export function amountInWords(n: number): string {
  n = Math.round(Number(n) || 0);
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : ""));
  const three = (x: number) => (x >= 100 ? ones[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x));
  // Indian system: crore, lakh, thousand
  const words = (x: number): string => {
    const out: string[] = [];
    const cr = Math.floor(x / 1e7);
    x %= 1e7;
    const lk = Math.floor(x / 1e5);
    x %= 1e5;
    const th = Math.floor(x / 1e3);
    x %= 1e3;
    if (cr) out.push(words(cr) + " Crore");
    if (lk) out.push(two(lk) + " Lakh");
    if (th) out.push(two(th) + " Thousand");
    if (x) out.push(three(x));
    return out.join(" ");
  };
  return "Rupees " + (words(n) || "Zero") + " Only";
}

export const agrRs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN") + "/-";

export function agrDateLong(iso: string): string {
  const dt = new Date(iso + "T00:00:00");
  const day = dt.getDate();
  const sfx = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return day + sfx + " " + dt.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Rounding goes into the last stage, so the stages always add up to the total. */
export function agrAmounts(total: number, stages: PaymentStage[]): number[] {
  const a = stages.map((st) => Math.round((total * st.pct) / 100));
  if (a.length) a[a.length - 1] = total - a.slice(0, -1).reduce((t, x) => t + x, 0);
  return a;
}

/** Inline text: a run of plain and bold segments. */
export type Inline = { text: string; bold?: boolean }[];

export type AgrBlock =
  | { kind: "title" | "center" | "heading" | "para" | "small"; inline: Inline; keep?: boolean }
  | { kind: "clause"; n: number; inline: Inline; keep?: boolean }
  | { kind: "schedHead"; keep: true }
  | { kind: "sched"; inline: Inline; keep?: boolean }
  | { kind: "signatures"; data: AgreementData };

function inline(line: string, V: Record<string, string>): Inline {
  const filled = line.replace(/\{(\w+)\}/g, (m, k: string) => (k in V ? V[k] : m));
  const out: Inline = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(filled); m; m = re.exec(filled)) {
    if (m.index > last) out.push({ text: filled.slice(last, m.index) });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < filled.length) out.push({ text: filled.slice(last) });
  return out;
}

function schedule(d: AgreementData): AgrBlock[] {
  const amts = agrAmounts(d.total, d.stages);
  const L = "abcdefghijklmnopqrstuvwxyz";
  const out: AgrBlock[] = [
    { kind: "schedHead", keep: true },
    { kind: "sched", inline: [{ text: `Total Project Cost: ${agrRs(d.total)} (${amountInWords(d.total)})`, bold: true }] },
    { kind: "sched", inline: [{ text: "The mutually agreed payment schedule for the rooftop solar project shall be as follows:" }] },
  ];
  d.stages.forEach((st, i) =>
    out.push({
      kind: "sched",
      inline: [
        { text: `${L[i] || i + 1}. ${st.name} – ${st.pct}%`, bold: true },
        { text: "\nAn amount of " },
        { text: `${agrRs(amts[i])} (${amountInWords(amts[i])})`, bold: true },
        { text: ` shall be paid by the Consumer ${st.when}.` },
      ],
    }),
  );
  if (d.advance > 0)
    out.push({
      kind: "sched",
      inline: [
        { text: "Out of the above, " },
        { text: `${agrRs(d.advance)} (${amountInWords(d.advance)})`, bold: true },
        { text: " has already been received from the Consumer as advance. Balance payable: " },
        { text: `${agrRs(d.total - d.advance)} (${amountInWords(d.total - d.advance)})`, bold: true },
        { text: "." },
      ],
    });
  out.push({ kind: "sched", inline: [{ text: `Total: ${agrRs(d.total)} (100%)`, bold: true }] });
  return out;
}

/** Splits the agreement text into the blocks the pages are packed from. */
export function agreementBlocks(d: AgreementData): AgrBlock[] {
  const oneLine = (t: string) => String(t || "").replace(/\s*\n\s*/g, ", ");
  const V: Record<string, string> = {
    date: agrDateLong(d.date),
    customer_name: d.cust_name,
    customer_address: oneLine(d.cust_address) + " - " + d.pincode,
    pincode: d.pincode,
    eb_number: d.eb || "",
    father_name: d.father || "",
    aadhaar: d.aadhaar || "",
    vendor_name: d.vendor_name,
    vendor_address: oneLine(d.vendor_address),
    total: agrRs(d.total),
    total_words: amountInWords(d.total),
    system_kw: d.kw ? d.kw + " kW" : "",
  };
  const lines = d.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: AgrBlock[] = [];
  let n = 0;
  lines.forEach((line, i) => {
    if (line === "{payment_schedule}") return void out.push(...schedule(d));
    if (line === "{signatures}") return void out.push({ kind: "signatures", data: d });
    if (line.startsWith("### ")) {
      n = 0;
      return void out.push({ kind: "heading", inline: inline(line.slice(4), V), keep: true });
    }
    if (line.startsWith("## ")) return void out.push({ kind: "center", inline: inline(line.slice(3), V), keep: true });
    if (line.startsWith("# ")) return void out.push({ kind: "title", inline: inline(line.slice(2), V) });
    if (line.startsWith("> ")) return void out.push({ kind: "small", inline: inline(line.slice(2), V) });
    if (line.startsWith("- ")) {
      n++;
      // A clause that leads straight into the schedule stays with it.
      return void out.push({ kind: "clause", n, inline: inline(line.slice(2), V), keep: lines[i + 1] === "{payment_schedule}" });
    }
    out.push({ kind: "para", inline: inline(line, V) });
  });
  return out;
}

/** "1234 5678 9012" → printable full number; anything else → "" (invalid). */
export function formatAadhaar(raw: string): string {
  const adh = raw.replace(/\s+/g, "");
  return /^\d{12}$/.test(adh) ? adh.replace(/(\d{4})(?=\d)/g, "$1 ") : "";
}
export const maskAadhaar = (full: string) => "XXXX XXXX " + full.replace(/\s+/g, "").slice(-4);

/** The org's agreement settings, with blanks filled from the company profile and the standard text. */
export function agreementConfig(s: OrgSettings, org: { name: string; address: string | null }) {
  const a = s.agreement;
  return {
    vendorName: a.vendorName || org.name,
    vendorAddress: a.vendorAddress || org.address || "",
    stamp: a.stamp,
    text: a.text || AGR_TEXT,
    stages: s.quotation.paymentStages as PaymentStage[],
  };
}

/** What still has to be filled in Settings before the first agreement, or "" when ready. */
export function agreementNotReady(cfg: ReturnType<typeof agreementConfig>): string {
  if (!cfg.vendorName || !cfg.vendorAddress) return "Fill your company legal name and registered office address.";
  return stgProblem(cfg.stages) || agrTextProblem(cfg.text);
}
