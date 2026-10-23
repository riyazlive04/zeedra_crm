/**
 * Subscription plans. No payment gateway is wired yet (see docs/DEPLOYMENT.md) — "upgrading"
 * records the organisation's chosen plan and our team follows up to collect payment. The shape
 * here is what a real gateway integration (Razorpay subscriptions) would bind to later.
 */
export type PlanId = "STARTER" | "GROWTH" | "SCALE";

export interface PlanDef {
  id: PlanId;
  name: string;
  priceMonthly: number; // INR, exclusive of GST
  priceYearly: number; // INR, exclusive of GST — ~2 months free vs monthly
  seatLimit: number | null; // null = unlimited
  leadLimitMonthly: number | null; // null = unlimited; soft limit, shown as a usage meter
  tagline: string;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    priceMonthly: 1499,
    priceYearly: 14990,
    seatLimit: 3,
    leadLimitMonthly: 150,
    tagline: "For installers getting off spreadsheets and WhatsApp DMs",
    features: [
      "Up to 3 team members",
      "150 leads / month",
      "EB bill → system size, subsidy & EMI engine",
      "Explainable Hot / Warm / Cold scoring",
      "Google Calendar site-visit booking",
      "GPS-verified field quotations",
      "Customer proposal links",
      "WhatsApp click-to-send (manual)",
    ],
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    priceMonthly: 4999,
    priceYearly: 49990,
    seatLimit: 10,
    leadLimitMonthly: 1000,
    tagline: "For teams running tele-calling and field sales at scale",
    features: [
      "Up to 10 team members",
      "1,000 leads / month",
      "Everything in Starter",
      "WhatsApp Cloud API automation (welcome, reminders, nudges)",
      "AI co-pilot: lead coaching, reply drafts, EB-bill photo scanning",
      "Automation rules engine",
      "Field-tracking leaderboard & manager review queue",
      "Installation → PM Surya Ghar subsidy tracking",
    ],
  },
  SCALE: {
    id: "SCALE",
    name: "Scale",
    priceMonthly: 11999,
    priceYearly: 119990,
    seatLimit: null,
    leadLimitMonthly: null,
    tagline: "For multi-branch EPCs and channel-partner networks",
    features: [
      "Unlimited team members",
      "Unlimited leads",
      "Everything in Growth",
      "Multiple branches / territories",
      "Priority WhatsApp support",
      "Dedicated onboarding",
      "API access for custom integrations",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["STARTER", "GROWTH", "SCALE"];

export const TRIAL_DAYS = 14;

export function isPlanId(v: unknown): v is PlanId {
  return v === "STARTER" || v === "GROWTH" || v === "SCALE";
}

export function planOf(org: { plan: string }): PlanDef {
  return PLANS[isPlanId(org.plan) ? org.plan : "GROWTH"];
}

export interface BillingState {
  plan: PlanDef;
  billingStatus: "TRIALING" | "ACTIVE" | "CANCELED";
  trialEndsAt: Date | null;
  trialDaysLeft: number | null; // null once trial has ended or org isn't trialing
  trialExpired: boolean;
}

export function billingState(org: { plan: string; billingStatus: string; trialEndsAt: Date | null }): BillingState {
  const plan = planOf(org);
  const status = org.billingStatus === "ACTIVE" || org.billingStatus === "CANCELED" ? org.billingStatus : "TRIALING";
  let trialDaysLeft: number | null = null;
  let trialExpired = false;
  if (status === "TRIALING" && org.trialEndsAt) {
    const msLeft = org.trialEndsAt.getTime() - Date.now();
    trialExpired = msLeft <= 0;
    trialDaysLeft = trialExpired ? 0 : Math.ceil(msLeft / 86_400_000);
  }
  return { plan, billingStatus: status, trialEndsAt: org.trialEndsAt, trialDaysLeft, trialExpired };
}

/** Seats beyond the plan's limit are blocked once the trial has run out — never mid-trial. */
export function seatLimitReached(org: { plan: string; billingStatus: string; trialEndsAt: Date | null }, currentSeatCount: number): boolean {
  const b = billingState(org);
  if (b.plan.seatLimit === null) return false;
  if (b.billingStatus === "TRIALING" && !b.trialExpired) return false;
  return currentSeatCount >= b.plan.seatLimit;
}
