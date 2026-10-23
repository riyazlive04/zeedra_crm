import type { OrgSettings } from "./settings";
import { unitsFromBill } from "./solar/sizing";

/** The subset of Lead fields the qualification engines read. Kept structural so tests need no DB. */
export interface QualLead {
  segment?: string | null;
  monthlyBill?: number | null;
  monthlyUnits?: number | null;
  ownsProperty?: boolean | null;
  roofType?: string | null;
  roofAreaSqft?: number | null;
  shadowFree?: boolean | null;
  siteVisitReady?: boolean | null;
  installationTimeline?: string | null;
  paymentMode?: string | null;
  budgetConfirmed?: boolean | null;
  loanInterest?: boolean | null;
  loanStatus?: string | null;
  objection?: string | null;
  decisionMakerMet?: boolean | null;
  lastContactAt?: Date | string | null;
}

export type BasicStatus = "QUALIFIED" | "DISQUALIFIED" | "INCOMPLETE";

export interface BasicResult {
  status: BasicStatus;
  reasons: string[]; // why disqualified
  warnings: string[]; // qualified but needs attention
  missing: string[]; // fields needed to decide
}

const isBusiness = (seg?: string | null) =>
  seg === "COMMERCIAL" || seg === "INDUSTRIAL" || seg === "INSTITUTIONAL";

/**
 * Stage 1 — basic qualification. A lead qualifies when the electricity bill
 * justifies solar and the customer owns the roof (or, for businesses, can get owner consent).
 */
export function basicQualification(lead: QualLead, s: OrgSettings): BasicResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const missing: string[] = [];

  const bill =
    lead.monthlyBill ?? (lead.monthlyUnits ? lead.monthlyUnits * s.tariffPerUnit + s.fixedChargesMonthly : null);
  const minBill = isBusiness(lead.segment) ? s.minMonthlyBillCommercial : s.minMonthlyBillResidential;

  if (bill == null) missing.push("Monthly electricity bill or units");
  else if (bill < minBill)
    reasons.push(`Monthly bill ₹${Math.round(bill)} is below the ₹${minBill} viability threshold.`);

  if (lead.ownsProperty == null) missing.push("Property ownership");
  else if (!lead.ownsProperty) {
    if (isBusiness(lead.segment)) warnings.push("Tenant premises — owner NOC and long-term lease required.");
    else if (s.requireOwnership) reasons.push("Customer does not own the property (rooftop rights required).");
    else warnings.push("Rented property — owner consent letter required.");
  }

  if (lead.roofAreaSqft != null && lead.roofAreaSqft > 0 && lead.roofAreaSqft < s.roofSqftPerKw) {
    reasons.push(`Shadow-free roof area ${lead.roofAreaSqft} sq.ft cannot fit a 1 kW system.`);
  }
  if (lead.roofType === "ASBESTOS") warnings.push("Asbestos roof — needs a separate elevated structure; check load-bearing.");
  if (lead.roofType === "TILED") warnings.push("Tiled roof — use hook-mount structure; confirm tile condition at site visit.");
  if (lead.shadowFree === false) warnings.push("Partial shading reported — consider optimisers/microinverters; verify in site survey.");

  const status: BasicStatus = reasons.length ? "DISQUALIFIED" : missing.length ? "INCOMPLETE" : "QUALIFIED";
  return { status, reasons, warnings, missing };
}

export interface ScoreItem {
  key: string;
  label: string;
  points: number;
}

export interface SalesScore {
  score: number;
  temperature: "HOT" | "WARM" | "COLD";
  breakdown: ScoreItem[];
  nextActions: string[];
}

const TIMELINE_POINTS: Record<string, number> = {
  IMMEDIATE: 30,
  WITHIN_1_MONTH: 24,
  ONE_TO_3_MONTHS: 15,
  THREE_TO_6_MONTHS: 6,
  EXPLORING: 0,
};

const OBJECTION_PENALTY: Record<string, number> = {
  NONE: 0,
  PRICE: -5,
  FINANCE: -5,
  ROOF_ISSUE: -10,
  OWNERSHIP: -20,
  FAMILY_DECISION: -6,
  TRUST: -6,
  TIMING: -8,
  COMPETITOR: -6,
  OTHER: -4,
};

const OBJECTION_PLAYBOOK: Record<string, string> = {
  PRICE: "Lead with net cost after subsidy and 25-year savings; show payback period and EMI-vs-bill comparison.",
  FINANCE: "Offer PM Surya Ghar collateral-free loan (~7% p.a.) — show that EMI is lower than the current bill.",
  ROOF_ISSUE: "Schedule a technical site survey; propose elevated/hook structure or reduced capacity.",
  OWNERSHIP: "Ask for owner's consent letter / NOC, or pitch to the property owner directly.",
  FAMILY_DECISION: "Book a family meeting (evening/weekend) and share the proposal PDF on WhatsApp in advance.",
  TRUST: "Share nearby installation references, warranty documents and customer video testimonials.",
  TIMING: "Set a dated follow-up; highlight subsidy availability and tariff hikes as reasons not to wait.",
  COMPETITOR: "Compare panel/inverter brands, DCR compliance, warranty and AMC — not just price.",
  OTHER: "Capture the objection precisely and escalate to the sales manager.",
};

/**
 * Stage 2 — sales qualification. Deterministic, explainable score (0–100) that drives HOT/WARM/COLD.
 * AI adds narrative on top, but the temperature itself is always reproducible from the data.
 */
export function salesScore(lead: QualLead, s: OrgSettings, basic?: BasicResult, now: Date = new Date()): SalesScore {
  const breakdown: ScoreItem[] = [];
  const nextActions: string[] = [];
  const add = (key: string, label: string, points: number) => breakdown.push({ key, label, points });

  // Installation readiness
  if (lead.installationTimeline) {
    add("timeline", `Timeline: ${lead.installationTimeline.replace(/_/g, " ").toLowerCase()}`, TIMELINE_POINTS[lead.installationTimeline] ?? 0);
  } else {
    add("timeline", "Timeline not captured", 5);
    nextActions.push("Ask when they want the system installed (timeline drives priority).");
  }

  // Site-visit readiness
  if (lead.siteVisitReady === true) add("siteVisit", "Ready for site visit", 20);
  else if (lead.siteVisitReady === false) {
    add("siteVisit", "Not ready for site visit", 0);
    nextActions.push("Understand what is blocking the site visit and offer a weekend slot.");
  } else {
    add("siteVisit", "Site-visit readiness unknown", 5);
    nextActions.push("Offer a free site survey and book a slot.");
  }

  // Financial readiness
  const mode = lead.paymentMode ?? "UNDECIDED";
  let finance = 3;
  let financeLabel = "Payment mode undecided";
  if (lead.budgetConfirmed || mode === "CASH") {
    finance = 20;
    financeLabel = "Budget confirmed / self-funded";
  } else if (mode === "LOAN" || mode === "PARTIAL_LOAN" || lead.loanInterest) {
    const ls = lead.loanStatus ?? "NOT_STARTED";
    finance = ls === "SANCTIONED" ? 20 : ls === "APPLIED" ? 15 : ls === "DOCS_PENDING" ? 10 : ls === "REJECTED" ? 0 : 8;
    financeLabel = `Loan route — ${ls.replace(/_/g, " ").toLowerCase()}`;
    if (ls === "NOT_STARTED" || ls === "DOCS_PENDING")
      nextActions.push("Collect loan documents (Aadhaar, PAN, bank statement, latest EB bill) and start the application.");
    if (ls === "REJECTED") nextActions.push("Loan rejected — try a co-applicant or NBFC partner, or resize the system.");
  } else {
    nextActions.push("Discuss payment: cash, or PM Surya Ghar loan with EMI below current bill.");
  }
  add("finance", financeLabel, finance);

  // Bill size (value of the opportunity)
  const units = lead.monthlyUnits ?? (lead.monthlyBill ? unitsFromBill(lead.monthlyBill, s) : 0);
  const bill = lead.monthlyBill ?? units * s.tariffPerUnit;
  const billPts = bill >= 5000 ? 15 : bill >= 3000 ? 12 : bill >= 2000 ? 9 : bill >= 1000 ? 5 : bill > 0 ? 2 : 0;
  add("bill", bill > 0 ? `Monthly bill ≈ ₹${Math.round(bill)}` : "Bill not captured", billPts);

  if (lead.decisionMakerMet) add("decisionMaker", "Decision-maker engaged", 8);
  else if (lead.decisionMakerMet === false) nextActions.push("Get the decision-maker on the next call or visit.");

  // Engagement recency
  if (lead.lastContactAt) {
    const days = (now.getTime() - new Date(lead.lastContactAt).getTime()) / 86_400_000;
    if (days <= 3) add("engagement", "Engaged in last 3 days", 7);
    else if (days <= 7) add("engagement", "Engaged in last week", 4);
    else {
      add("engagement", `No contact for ${Math.floor(days)} days`, 0);
      nextActions.push("Re-engage — lead is going stale.");
    }
  }

  const obj = lead.objection ?? "NONE";
  if (obj !== "NONE") {
    add("objection", `Objection: ${obj.replace(/_/g, " ").toLowerCase()}`, OBJECTION_PENALTY[obj] ?? -4);
    if (OBJECTION_PLAYBOOK[obj]) nextActions.unshift(OBJECTION_PLAYBOOK[obj]);
  }

  let score = Math.max(0, Math.min(100, breakdown.reduce((a, b) => a + b.points, 0)));

  if (basic?.status === "DISQUALIFIED") {
    score = Math.min(score, 15);
    breakdown.push({ key: "basic", label: "Failed basic qualification", points: 0 });
  }

  const temperature = basic?.status === "DISQUALIFIED" ? "COLD" : score >= s.hotScore ? "HOT" : score >= s.warmScore ? "WARM" : "COLD";
  if (temperature === "HOT" && lead.siteVisitReady) nextActions.unshift("Hot lead — book the site visit within 24 hours.");

  return { score, temperature, breakdown, nextActions: Array.from(new Set(nextActions)).slice(0, 5) };
}
