/** Standard reducing-balance EMI. rate is annual % (e.g. 7). */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}

export interface LoanPlan {
  downPayment: number;
  loanAmount: number;
  ratePct: number;
  tenureMonths: number;
  emi: number;
  totalInterest: number;
  /** Positive when monthly bill savings exceed the EMI — the key sales argument. */
  monthlyCashflow: number;
}

export function loanPlan(
  netCost: number,
  monthlySavings: number,
  ratePct: number,
  tenureMonths: number,
  downPaymentPct: number,
): LoanPlan {
  const downPayment = Math.round((netCost * downPaymentPct) / 100);
  const loanAmount = Math.max(0, netCost - downPayment);
  const e = emi(loanAmount, ratePct, tenureMonths);
  return {
    downPayment,
    loanAmount,
    ratePct,
    tenureMonths,
    emi: e,
    totalInterest: Math.max(0, e * tenureMonths - loanAmount),
    monthlyCashflow: Math.round(monthlySavings - e),
  };
}

/** Compare a few tenures so the salesperson can show "EMI less than your bill". */
export function loanOptions(netCost: number, monthlySavings: number, ratePct: number, downPaymentPct: number) {
  return [36, 60, 84, 120].map((t) => loanPlan(netCost, monthlySavings, ratePct, t, downPaymentPct));
}
