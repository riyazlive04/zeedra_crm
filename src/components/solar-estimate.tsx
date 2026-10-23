import { Sun, Zap, IndianRupee, Leaf, TrendingUp, AlertTriangle, Landmark, PanelsTopLeft } from "lucide-react";
import type { SizingResult } from "@/lib/solar/sizing";
import type { LoanPlan } from "@/lib/solar/finance";
import { formatINR, formatNumber } from "@/lib/text";

/** The customer-facing estimate block used on lead pages, the calculator and public landing pages. */
export function SolarEstimate({ r, loan, dense }: { r: SizingResult; loan?: LoanPlan | null; dense?: boolean }) {
  const tile = (icon: React.ReactNode, label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="sun-gradient relative overflow-hidden rounded-2xl p-4 text-white shadow-sm">
        <Sun className="absolute -right-4 -top-4 h-24 w-24 opacity-20" />
        <div className="text-xs font-medium text-white/80">Recommended system</div>
        <div className="font-display text-3xl font-extrabold">{r.recommendedKw} kW</div>
        <div className="mt-1 text-xs text-white/90">
          {r.panelCount} × {r.panelWattage} W panels · {r.inverterKw} kW inverter · ~{formatNumber(r.roofNeededSqft)} sq.ft roof
        </div>
      </div>
      <div className={`grid gap-2 ${dense ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {tile(<IndianRupee className="h-3.5 w-3.5" />, "System cost (incl. GST)", formatINR(r.totalCost), `GST ${formatINR(r.gstAmount)}`)}
        {tile(<Landmark className="h-3.5 w-3.5 text-emerald-600" />, "PM Surya Ghar subsidy", <span className="text-emerald-700">− {formatINR(r.subsidy)}</span>, r.stateSubsidy ? `incl. state ${formatINR(r.stateSubsidy)}` : "Credited to customer")}
        {tile(<IndianRupee className="h-3.5 w-3.5 text-sun-600" />, "Net cost", <span className="text-sun-700">{formatINR(r.netCost)}</span>)}
        {tile(<TrendingUp className="h-3.5 w-3.5" />, "Monthly savings", formatINR(r.monthlySavings), `New bill ≈ ${formatINR(r.newMonthlyBill)}`)}
        {tile(<Zap className="h-3.5 w-3.5" />, "Generation", `${formatNumber(r.monthlyGenerationKwh)} units/mo`, `${formatNumber(r.annualGenerationKwh)} kWh/yr`)}
        {tile(<PanelsTopLeft className="h-3.5 w-3.5" />, "Payback", `${r.paybackYears} yrs`, `25-yr savings ${formatINR(r.savings25Years)}`)}
      </div>
      {loan && loan.loanAmount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div>
            <div className="text-xs font-medium text-sky-800">Solar loan @ {loan.ratePct}% · {Math.round(loan.tenureMonths / 12)} yrs</div>
            <div className="text-[11px] text-sky-700/80">
              Down payment {formatINR(loan.downPayment)} · loan {formatINR(loan.loanAmount)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-bold text-sky-900">{formatINR(loan.emi)}/mo</div>
            <div className={`text-[11px] font-medium ${loan.monthlyCashflow >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
              {loan.monthlyCashflow >= 0 ? `EMI < savings by ${formatINR(loan.monthlyCashflow)}` : `EMI exceeds savings by ${formatINR(-loan.monthlyCashflow)}`}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-emerald-700">
        <Leaf className="h-3.5 w-3.5" /> Avoids {r.co2TonnesPerYear} t CO₂/year — like planting {formatNumber(r.treesEquivalent)} trees
      </div>
      {r.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
