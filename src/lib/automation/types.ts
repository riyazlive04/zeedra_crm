// Shared (client + server) automation vocabulary.

export const TRIGGERS = {
  LEAD_CREATED: { label: "New lead created", kind: "event" },
  LEAD_QUALIFIED: { label: "Lead passes basic qualification", kind: "event" },
  LEAD_DISQUALIFIED: { label: "Lead fails basic qualification", kind: "event" },
  TEMPERATURE_CHANGED: { label: "Lead temperature changes (Hot/Warm/Cold)", kind: "event" },
  STAGE_CHANGED: { label: "Pipeline stage changes", kind: "event" },
  APPOINTMENT_BOOKED: { label: "Appointment booked", kind: "event" },
  APPOINTMENT_REMINDER: { label: "Before an appointment (minutes before)", kind: "schedule" },
  QUOTATION_SENT: { label: "Quotation sent to customer", kind: "event" },
  QUOTATION_FLAGGED: { label: "Quotation failed GPS/time validation", kind: "event" },
  NO_RESPONSE: { label: "No contact for a period (minutes of inactivity)", kind: "schedule" },
  QUOTATION_EXPIRING: { label: "Quotation about to expire (minutes before)", kind: "schedule" },
  WHATSAPP_RECEIVED: { label: "Customer sends a WhatsApp message", kind: "event" },
  PROJECT_STAGE_CHANGED: { label: "Installation project stage changes", kind: "event" },
} as const;

export type Trigger = keyof typeof TRIGGERS;

export const CONDITION_FIELDS = {
  temperature: { label: "Temperature", options: ["HOT", "WARM", "COLD"] },
  stage: {
    label: "Stage",
    options: ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST", "DISQUALIFIED"],
  },
  segment: { label: "Segment", options: ["RESIDENTIAL", "HOUSING_SOCIETY", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURE", "INSTITUTIONAL"] },
  source: {
    label: "Source",
    options: ["WEBSITE", "FACEBOOK", "INSTAGRAM", "GOOGLE_ADS", "WHATSAPP", "REFERRAL", "WALK_IN", "JUSTDIAL", "INDIAMART", "CHANNEL_PARTNER", "COLD_CALL", "EXHIBITION", "OTHER"],
  },
  monthlyBill: { label: "Monthly bill (₹)", options: null },
  score: { label: "Score", options: null },
  recommendedKw: { label: "Recommended kW", options: null },
  paymentMode: { label: "Payment mode", options: ["CASH", "LOAN", "PARTIAL_LOAN", "UNDECIDED"] },
  objection: { label: "Objection", options: ["NONE", "PRICE", "FINANCE", "ROOF_ISSUE", "OWNERSHIP", "FAMILY_DECISION", "TRUST", "TIMING", "COMPETITOR", "OTHER"] },
  appointmentType: { label: "Appointment type", options: ["SITE_VISIT", "QUOTATION_MEETING", "FOLLOW_UP_CALL", "LOAN_DOCUMENTATION", "INSTALLATION"] },
  projectStage: { label: "Project stage", options: null },
} as const;

export type ConditionOp = "eq" | "neq" | "gte" | "lte" | "in";
export interface Condition {
  field: keyof typeof CONDITION_FIELDS;
  op: ConditionOp;
  value: string | number | string[];
}

export type Action =
  | { type: "SEND_WHATSAPP"; templateKey: string }
  | { type: "CREATE_TASK"; title: string; dueInHours: number; priority?: "LOW" | "NORMAL" | "HIGH" }
  | { type: "NOTIFY_ASSIGNEE"; title: string }
  | { type: "NOTIFY_MANAGERS"; title: string }
  | { type: "SET_FOLLOW_UP"; inHours: number };

export const ACTION_LABELS: Record<Action["type"], string> = {
  SEND_WHATSAPP: "Send WhatsApp template",
  CREATE_TASK: "Create follow-up task",
  NOTIFY_ASSIGNEE: "Notify assigned salesperson",
  NOTIFY_MANAGERS: "Notify managers",
  SET_FOLLOW_UP: "Set next follow-up date",
};

export function evaluateConditions(conds: Condition[], ctx: Record<string, unknown>): boolean {
  return conds.every((c) => {
    const v = ctx[c.field];
    switch (c.op) {
      case "eq":
        return String(v) === String(c.value);
      case "neq":
        return String(v) !== String(c.value);
      case "gte":
        return typeof v === "number" && v >= Number(c.value);
      case "lte":
        return typeof v === "number" && v <= Number(c.value);
      case "in":
        return Array.isArray(c.value) && c.value.map(String).includes(String(v));
      default:
        return false;
    }
  });
}
