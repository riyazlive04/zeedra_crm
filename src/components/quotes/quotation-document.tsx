import { format } from "date-fns";
import type { ReactNode } from "react";
import { fmtINR, netPositionSeries, type QuotifySnapshot } from "@/lib/solar/quotify";
import type { OrgSettings } from "@/lib/settings";

/**
 * The generated quotation — four A4 pages: cover letter, quotation table, how-it-works + ROI,
 * and terms & conditions. Rendered from the quotation's saved snapshot, so it never changes
 * after the fact even when prices in Settings do.
 */

export interface QuotationDocCompany {
  name: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  logoUrl: string | null;
  signatoryName: string;
  footerLine: string;
  bank: { name: string; branch: string; accNo: string; ifsc: string };
  validityDays: number;
}

export function docCompany(
  org: { name: string; address: string | null; phone: string | null; gstin: string | null; logoUrl: string | null },
  s: OrgSettings,
): QuotationDocCompany {
  return {
    name: org.name,
    address: org.address,
    phone: org.phone,
    gstin: org.gstin,
    logoUrl: org.logoUrl,
    signatoryName: s.quotation.signatoryName,
    footerLine: s.quotation.footerLine,
    bank: s.quotation.bank,
    validityDays: s.quotationValidityDays,
  };
}

const INK = "#0d3b4a";
const ACCENT = "#f5a623";

function Letterhead({ c, showPhone = true }: { c: QuotationDocCompany; showPhone?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b-[3px] border-slate-200 px-[14mm] py-4">
      <div className="flex items-center gap-3">
        {c.logoUrl && <img src={c.logoUrl} alt="" className="h-11 w-auto object-contain" />}
        <div>
          <div className="text-[19pt] font-bold leading-tight" style={{ color: INK }}>
            {c.name}
          </div>
          {c.address && <div className="text-[8.5pt] text-[#1a5568]">{c.address}</div>}
        </div>
      </div>
      <div className="text-right text-[8pt] leading-relaxed text-[#1a5568]">
        {c.gstin && <div>GSTIN: {c.gstin}</div>}
        {showPhone && c.phone && <div>Mobile: {c.phone}</div>}
      </div>
    </div>
  );
}

function Footer({ c }: { c: QuotationDocCompany }) {
  return (
    <div className="absolute inset-x-[14mm] bottom-[8mm] border-t border-slate-200 pt-2 text-center text-[7.5pt] uppercase tracking-wider text-slate-500">
      {c.name}
      {c.footerLine && <div className="text-[6.7pt] normal-case tracking-normal">{c.footerLine}</div>}
    </div>
  );
}

function Page({ c, children, showPhone }: { c: QuotationDocCompany; children: ReactNode; showPhone?: boolean }) {
  return (
    <section className="quote-page text-[9.5pt] text-slate-700">
      <Letterhead c={c} showPhone={showPhone} />
      <div className="px-[14mm] pt-5">{children}</div>
      <Footer c={c} />
    </section>
  );
}

function SectionRule({ title }: { title: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200" />
      <div className="text-[7.5pt] font-semibold uppercase tracking-[0.25em] text-slate-400">{title}</div>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function TermBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 border-l-[3px] pl-2 text-[8.5pt] font-bold uppercase tracking-wider" style={{ borderColor: ACCENT, color: INK }}>
        {title}
      </div>
      <div className="space-y-1.5 leading-relaxed">{children}</div>
    </div>
  );
}

const lakhs = (v: number) => {
  const l = Math.abs(v) / 100000;
  return (v < 0 ? "-" : v > 0 ? "+" : "") + "₹" + (Number.isInteger(l) ? l : parseFloat(l.toFixed(1))) + "L";
};

/** Breakeven chart — net position over 30 years (red before breakeven, gold at it, green after). */
function BreakevenChart({ annualSave, netCost, paybackYrs }: { annualSave: number; netCost: number; paybackYrs: number }) {
  const data = netPositionSeries(annualSave, netCost);
  const breakPt = Math.ceil(paybackYrs) + 1;
  const W = 680;
  const H = 330;
  const padL = 40;
  const padB = 22;
  const padT = 12;
  const yMin = -Math.ceil((netCost * 1.05) / 10000) * 10000;
  const rawMax = Math.max(0, ...data);
  const span = rawMax - yMin || 1;
  const step = [50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000].find((s) => span / s <= 8) ?? 10000000;
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const ticks: number[] = [];
  for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) ticks.push(t);
  if (!ticks.includes(yMin)) ticks.unshift(yMin);
  const y = (v: number) => padT + ((yMax - v) / (yMax - yMin)) * (H - padT - padB);
  const bw = (W - padL) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Breakeven chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(201,168,76,0.8)" : "#f0f0f0"} strokeWidth={t === 0 ? 2.5 : 1} />
          <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize="7" fill="#6b7280">
            {lakhs(t)}
          </text>
        </g>
      ))}
      {data.map((v, i) => {
        const x = padL + i * bw + bw * 0.075;
        const top = Math.min(y(v), y(0));
        const h = Math.max(1, Math.abs(y(v) - y(0)));
        const fill = i === breakPt ? "#C9A84C" : v < 0 ? "#ef4444" : "#4ade80";
        return (
          <g key={i}>
            <rect x={x} y={top} width={bw * 0.85} height={h} rx={2} fill={fill}>
              <title>{`Yr ${i}: ${v >= 0 ? "+" : "-"}₹${parseFloat((Math.abs(v) / 100000).toFixed(2))}L`}</title>
            </rect>
            <text x={x + (bw * 0.85) / 2} y={H - 8} textAnchor="middle" fontSize="6" fill="#6b7280">
              Yr {i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function FlowNode({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {icon}
      <div className="text-[7pt] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

const Arrow = () => (
  <svg width="36" height="14" viewBox="0 0 36 14" fill="none" aria-hidden="true">
    <line x1="0" y1="7" x2="27" y2="7" stroke="#9ca3af" strokeWidth="1.3" strokeDasharray="3 2" />
    <polyline points="23,3 30,7 23,11" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
const ModuleIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B2849" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="12" rx="1.5" />
    <line x1="2" y1="9.5" x2="22" y2="9.5" />
    <line x1="2" y1="13.5" x2="22" y2="13.5" />
    <line x1="8.5" y1="5" x2="8.5" y2="17" />
    <line x1="15.5" y1="5" x2="15.5" y2="17" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <line x1="9" y1="21" x2="15" y2="21" />
  </svg>
);
const HomeIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 11 12 2 21 11" />
    <rect x="4" y="11" width="16" height="11" rx="0.5" />
    <rect x="9" y="15" width="4" height="7" rx="0.5" />
    <line x1="15" y1="13" x2="18" y2="13" />
    <line x1="15" y1="15.5" x2="18" y2="15.5" />
  </svg>
);
const GridIcon = () => (
  <svg width="30" height="32" viewBox="0 0 30 32" fill="none" stroke="#10b981" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="15" y1="1" x2="15" y2="5" />
    <line x1="9" y1="5" x2="21" y2="5" />
    <line x1="10" y1="10" x2="20" y2="10" />
    <line x1="15" y1="1" x2="4" y2="28" />
    <line x1="15" y1="1" x2="26" y2="28" />
    <line x1="7" y1="16" x2="23" y2="16" />
    <line x1="5" y1="22" x2="25" y2="22" />
    <line x1="10" y1="10" x2="23" y2="16" />
    <line x1="20" y1="10" x2="7" y2="16" />
    <line x1="7" y1="16" x2="25" y2="22" />
    <line x1="23" y1="16" x2="5" y2="22" />
    <line x1="2" y1="28" x2="7" y2="28" />
    <line x1="23" y1="28" x2="28" y2="28" />
  </svg>
);
const SunIcon = () => (
  <svg width="58" height="58" viewBox="0 0 58 58" fill="none" aria-hidden="true">
    <circle cx="24" cy="29" r="18" fill="rgba(251,191,36,0.08)" />
    <circle cx="24" cy="29" r="11" fill="rgba(251,191,36,0.2)" stroke="#f59e0b" strokeWidth="1.8" />
    <circle cx="24" cy="29" r="7" fill="#fbbf24" />
    <line x1="24" y1="15" x2="24" y2="10" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="24" y1="43" x2="24" y2="48" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="10" y1="29" x2="5" y2="29" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="14.5" y1="18.5" x2="10" y2="14" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14.5" y1="39.5" x2="10" y2="44" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="37" y1="29" x2="57" y2="29" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3" />
    <line x1="33.5" y1="19.5" x2="50" y2="10" stroke="#fcd34d" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 3" />
    <line x1="33.5" y1="38.5" x2="50" y2="48" stroke="#fcd34d" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 3" />
  </svg>
);
const MoonIcon = () => (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
    <circle cx="43" cy="7" r="1.3" fill="#c4b5fd" />
    <circle cx="49" cy="19" r="0.9" fill="#a78bfa" />
    <circle cx="45" cy="33" r="1.1" fill="#c4b5fd" />
    <circle cx="8" cy="9" r="0.8" fill="#a78bfa" />
    <circle cx="15" cy="4" r="1.1" fill="#c4b5fd" />
    <circle cx="22" cy="28" r="13" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.6" />
    <circle cx="28" cy="24" r="11" fill="#eef1fa" />
  </svg>
);

export function QuotationDocument({
  snap,
  number,
  version,
  createdAt,
  company,
}: {
  snap: QuotifySnapshot;
  number: string;
  version: number;
  createdAt: Date;
  company: QuotationDocCompany;
}) {
  const r = snap.result;
  const cust = snap.customer;
  const isDcr = snap.input.systemType === "dcr";
  const ref = version > 1 ? `${number}-R${version - 1}` : number;
  const breakYr = createdAt.getFullYear() + Math.ceil(r.savings.paybackYrs);
  const addrLine = [[cust.address, cust.pincode].filter(Boolean).join(" - "), cust.ebNumber ? "EB Consumer No: " + cust.ebNumber : ""].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[210mm]">
      {/* PAGE 1 — COVER LETTER */}
      <Page c={company}>
        <div className="flex justify-between border-b border-slate-100 pb-3 text-[9pt] text-slate-500">
          <span>Ref: {ref}</span>
          <span>Date: {format(createdAt, "dd MMM yyyy")}</span>
        </div>
        <div className="mt-5 rounded-r-md border-l-4 bg-[#fcfbf7] px-4 py-3" style={{ borderColor: ACCENT }}>
          <div className="text-[13pt] font-bold" style={{ color: INK }}>
            {cust.name}
          </div>
          <div className="whitespace-pre-line text-[8.5pt] text-slate-500">
            {addrLine}
            {addrLine && "\n"}
            {cust.phone && `Mobile: ${cust.phone}`}
          </div>
        </div>
        <p className="mt-5 border border-slate-200 border-l-4 bg-[#f7f7f5] px-4 py-3 text-[10pt]" style={{ borderLeftColor: INK }}>
          <b style={{ color: INK }}>Sub:</b> Quote for{" "}
          <b>
            {r.actualKw}kW {r.sysLabel}
          </b>{" "}
          Solar Power Plant{isDcr && " in PM Surya Ghar Scheme"}
        </p>
        <div className="mt-5 space-y-3 text-[10pt] leading-relaxed">
          <p>Dear {cust.name},</p>
          <p>
            We thank you for giving us this opportunity to be of service to you. Further to your discussion, find below our quotation for <b>{r.actualKw} kW</b> {r.structLabel} for your residence.
          </p>
          <p>
            Our solar panels carry a <b>30-year performance warranty</b>, ensuring long-term reliability — and the savings projections in this document are backed by that guarantee.
          </p>
          <p>You can be rest assured of the quality of the product and we assure you of our best services while meeting your requirements.</p>
          <p>Feel free to get in touch with the undersigned in case of any further queries and clarifications.</p>
          <p>Thanking you and assuring you our best services at all the times,</p>
          <p className="pt-1">Yours Faithfully</p>
        </div>
        <div className="mt-8 border-t border-slate-100 pt-4">
          <div className="text-[11pt] font-bold" style={{ color: INK }}>
            {company.signatoryName || company.name}
          </div>
          {company.signatoryName && (
            <>
              <div className="text-[9pt] text-slate-500">Managing Director</div>
              <div className="text-[9pt] text-slate-500">{company.name}</div>
            </>
          )}
        </div>
      </Page>

      {/* PAGE 2 — QUOTATION TABLE */}
      <Page c={company}>
        <h2 className="text-center text-[13pt] font-bold" style={{ color: INK }}>
          {r.title}
        </h2>
        <div className="mx-auto mb-4 mt-1.5 h-[3px] w-14 rounded" style={{ background: ACCENT }} />
        <table className="w-full border-collapse text-[8.5pt]">
          <thead>
            <tr className="text-left text-[7.5pt] uppercase tracking-wider text-white" style={{ background: INK }}>
              <th className="w-[5%] px-1.5 py-2">S.no</th>
              <th className="w-[26%] px-1.5 py-2">Content</th>
              <th className="w-[26%] px-1.5 py-2">Description</th>
              <th className="w-[22%] px-1.5 py-2">Make</th>
              <th className="w-[10%] px-1.5 py-2 text-center">Qty</th>
              <th className="w-[11%] px-1.5 py-2 text-center">UOM</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 even:bg-slate-50/60">
                <td className="px-1.5 py-1.5 text-center text-slate-400">{i + 1}</td>
                <td className="px-1.5 py-1.5 font-semibold text-slate-800">{row.content}</td>
                <td className="px-1.5 py-1.5 text-[#555]">{row.desc}</td>
                <td className="px-1.5 py-1.5 text-[#374151]">{row.make}</td>
                <td className="px-1.5 py-1.5 text-center">{Math.round(row.qty * 100) / 100}</td>
                <td className="px-1.5 py-1.5 text-center text-slate-500">{row.uom}</td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-semibold" style={{ color: INK }}>
              <td colSpan={4} className="px-1.5 py-2">
                Sub Total (Before GST)
              </td>
              <td colSpan={2} className="px-1.5 py-2 text-right">
                {fmtINR(r.preTax)}
              </td>
            </tr>
            <tr className="bg-[#fffbeb] text-[#92650a]">
              <td colSpan={4} className="px-1.5 py-2">
                GST @ {r.blendPct}% (blended) included in total
              </td>
              <td colSpan={2} className="px-1.5 py-2 text-right">
                {fmtINR(r.gst)}
              </td>
            </tr>
            <tr className="text-white" style={{ background: INK }}>
              <td colSpan={4} className="px-1.5 py-2.5 text-[11pt] font-bold">
                TOTAL (Incl. GST)
              </td>
              <td colSpan={2} className="px-1.5 py-2.5 text-right text-[13pt] font-extrabold" style={{ color: "#fbbf24" }}>
                {fmtINR(r.grandTotal)}
              </td>
            </tr>
            {r.subsidy > 0 && (
              <>
                <tr className="bg-[#fffbeb] text-[#92650a]">
                  <td colSpan={4} className="px-1.5 py-2">
                    Less: Govt Subsidy (credited to your bank account)
                  </td>
                  <td colSpan={2} className="px-1.5 py-2 text-right">
                    − {fmtINR(r.subsidy)}
                  </td>
                </tr>
                <tr className="text-white" style={{ background: INK }}>
                  <td colSpan={4} className="px-1.5 py-2.5 text-[11pt] font-bold">
                    NET COST AFTER SUBSIDY
                  </td>
                  <td colSpan={2} className="px-1.5 py-2.5 text-right text-[13pt] font-extrabold" style={{ color: "#fbbf24" }}>
                    {fmtINR(r.netCost)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        <div className="mt-4 rounded-r-md border border-l-4 border-slate-200 bg-[#fafaf9] px-4 py-3 text-[8.5pt]" style={{ borderLeftColor: ACCENT }}>
          <b style={{ color: INK }}>Note:</b>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-600">
            {isDcr && (
              <li>
                For this Solar Plant, total Subsidy will be <b className="text-slate-800">{fmtINR(r.subsidy)}</b> (PM Surya Ghar {fmtINR(r.centralSubsidy)}
                {r.stateSubsidy ? ` + TN Govt ${fmtINR(r.stateSubsidy)}` : ""}) which will be directly credited to your bank account.
              </li>
            )}
            <li>EB Meter Cost is Additional (Approx ₹5,000)</li>
            <li>We will facilitate the Net Metering and subsidy application process.</li>
            <li>Price is valid for {company.validityDays} days from date of quotation.</li>
          </ol>
        </div>
      </Page>

      {/* PAGE 3 — HOW IT WORKS + ROI */}
      <Page c={company}>
        <SectionRule title="How Your System Works" />
        <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-[#fffdf2] px-6 py-3">
          <div className="flex flex-col items-center">
            <SunIcon />
            <div className="text-[6pt] uppercase tracking-[0.15em] text-[#d97706]">Daytime</div>
          </div>
          <FlowNode icon={<ModuleIcon />} label="Solar Module" />
          <Arrow />
          <FlowNode icon={<HomeIcon />} label="Your Home" />
          <Arrow />
          <FlowNode icon={<GridIcon />} label="Grid (Excess)" />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-indigo-100 bg-[#eef1fa] px-6 py-3">
          <div className="flex flex-col items-center">
            <MoonIcon />
            <div className="text-[6pt] uppercase tracking-[0.15em] text-[#7c3aed]">Nighttime</div>
          </div>
          <FlowNode icon={<GridIcon />} label="Grid" />
          <Arrow />
          <FlowNode icon={<HomeIcon />} label="Your Home" />
        </div>

        <div className="mt-4 flex items-center rounded-r-xl border border-l-4 border-amber-100 bg-[#fff8ec] px-6 py-4" style={{ borderLeftColor: "#d97706" }}>
          <div className="flex-1">
            <div className="text-[7pt] font-semibold uppercase tracking-[0.2em] text-slate-400">Investment Recovered by</div>
            <div className="font-mono text-[20pt] font-bold text-[#b45309]">Year {breakYr}</div>
          </div>
          <div className="mx-4 h-12 w-px bg-amber-200" />
          <div className="flex-1">
            <div className="text-[7pt] font-semibold uppercase tracking-[0.2em] text-slate-400">Then it earns you</div>
            <div className="font-mono text-[16pt] font-bold" style={{ color: INK }}>
              Every Month
            </div>
            <div className="text-[7pt] text-slate-400">for the next 30 years</div>
          </div>
        </div>

        <SectionRule title="Your Return On Investment" />
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200">
          {[
            ["Bi-Monthly Saving", fmtINR(r.savings.bimonthlySave), "avg. per TNEB bill cycle", true],
            ["Annual Saving", fmtINR(r.savings.annualSave), "per year", false],
            ["Payback Period", `${r.savings.paybackYrs.toFixed(1)} yrs`, "investment recovered", false],
            ["30-Year Net Gain", fmtINR(r.savings.netBenefit30), "total benefit", false],
          ].map(([label, value, sub, hl], i) => (
            <div key={String(label)} className={`px-5 py-3 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""} border-slate-200 ${hl ? "border-l-4 border-l-[#d97706] bg-[#fffdf2]" : "bg-[#fafaf9]"}`}>
              <div className="text-[7pt] font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</div>
              <div className={`font-mono text-[18pt] font-bold ${hl ? "text-[#b45309]" : ""}`} style={hl ? undefined : { color: INK }}>
                {value}
              </div>
              <div className="text-[7pt] text-slate-400">{sub}</div>
            </div>
          ))}
        </div>

        <div className="mb-2 mt-5 flex items-center justify-between">
          <div className="text-[8pt] font-bold uppercase tracking-wider text-slate-500">Breakeven Chart — Net Position Over 30 Years</div>
          <div className="flex gap-3 text-[7.5pt] text-slate-600">
            {[
              ["#ef4444", "Pre-Breakeven"],
              ["#C9A84C", "Breakeven"],
              ["#4ade80", "Net Profit"],
            ].map(([color, l]) => (
              <span key={l} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                {l}
              </span>
            ))}
          </div>
        </div>
        <BreakevenChart annualSave={r.savings.annualSave} netCost={r.netCost} paybackYrs={r.savings.paybackYrs} />
      </Page>

      {/* PAGE 4 — TERMS & CONDITIONS */}
      <Page c={company} showPhone={false}>
        <h2 className="text-center text-[15pt] font-bold" style={{ color: INK }}>
          Terms &amp; Conditions
        </h2>
        <div className="mx-auto mb-5 mt-1.5 h-[3px] w-14 rounded" style={{ background: ACCENT }} />
        <div className="grid grid-cols-2 gap-8 text-[8.5pt]">
          <div>
            <TermBlock title="Validity Of Offer">
              <p>
                This offer is valid for <b>{company.validityDays} days</b> from the date of offer and thereafter subject to our reconfirmation.
              </p>
            </TermBlock>
            <TermBlock title="Project Timeline">
              <p>Materials Delivery — 1–2 weeks after order confirmation</p>
              <p>Installation — 1 week</p>
              <p>Net Metering Processing — 3–4 weeks</p>
            </TermBlock>
            {isDcr && (
              <TermBlock title="Government Subsidy (PM Surya Ghar)">
                <p>We will facilitate the Subsidy Process. Subsidy will be directly credited to your bank account by DISCOM after successful installation and inspection.</p>
                <p>
                  <b>Central (PM Surya Ghar):</b> ₹30,000 per kW up to 2 kW, ₹18,000 for the 3rd kW — maximum <b>₹78,000</b> for 3 kW and above.
                </p>
                {snap.stateSubsidy && (
                  <p>
                    <b>Tamil Nadu Govt (G.O. 102):</b> ₹5,000 (1 kW), ₹10,000 (2 kW), <b>₹22,000</b> (3 kW and above), for the first 1,00,000 eligible applicants.
                  </p>
                )}
              </TermBlock>
            )}
            <TermBlock title="Payment Terms">
              {snap.paymentStages.map((st, i) => (
                <p key={i}>
                  <b>{st.pct}%</b> {st.name}
                  {st.when ? `, ${st.when}` : ""}
                </p>
              ))}
            </TermBlock>
            <TermBlock title="Bank Details">
              <p>
                <b>Bank:</b> {company.bank.name}
              </p>
              <p>
                <b>Branch:</b> {company.bank.branch}
              </p>
              <p>
                <b>A/C No:</b> {company.bank.accNo}
              </p>
              <p>
                <b>IFSC:</b> {company.bank.ifsc}
              </p>
            </TermBlock>
          </div>
          <div>
            <TermBlock title="Warranty">
              <p>
                <b>Solar Panel</b>
              </p>
              <div className="flex items-center gap-2 rounded-md border-[1.5px] border-[#f59e0b] bg-[#fffbeb] px-2.5 py-1.5">
                <span className="text-[14pt] font-extrabold leading-none text-[#d97706]">30</span>
                <span className="text-[7.5pt] leading-snug text-[#92650a]">
                  <b>Year Performance Warranty</b>
                  <br />
                  80% Power Output Guaranteed
                </span>
              </div>
              <p>Product Warranty: 12 Years</p>
              <p className="pt-2">
                <b>Free AMC: 5 Years</b> (as per MNRE Guidelines)
              </p>
              <p className="pt-2">
                <b>Inverter</b> — 7–10 Years Warranty
              </p>
              <p className="pt-2">
                <b>Balance Of System</b> — 1 Year Warranty
              </p>
              <p className="pt-2">
                Parts and Components, which are repaired or replaced during such period, are warranted for the original warranty period only. The warranty shall not apply to defects resulting from:
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Willful damage or negligence, normal wear and tear</li>
                <li>Installation and/or maintenance by third party without supplier&apos;s prior written consent</li>
                <li>Misuse or abuse of Equipment</li>
                <li>Modifications or alterations without supplier&apos;s written consent</li>
              </ul>
            </TermBlock>
          </div>
        </div>
      </Page>
    </div>
  );
}
