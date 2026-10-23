import type { Action, Condition, Trigger } from "./automation/types";

export const DEFAULT_TEMPLATES: { key: string; name: string; category: string; body: string }[] = [
  {
    key: "welcome",
    name: "Welcome — new enquiry",
    category: "UTILITY",
    body: "Namaste {{name}} 🙏 Thank you for your interest in rooftop solar with {{company}}!\n\nI'm {{salesperson}}, your solar advisor. To design the right system for your home, could you share a photo of your latest electricity (EB) bill? ☀️",
  },
  {
    key: "proposal_estimate",
    name: "Instant solar estimate (from EB bill)",
    category: "UTILITY",
    body: "Hi {{name}}, based on your EB bill of {{bill}}/month, here is your solar estimate ☀️\n\n🔆 System: {{kw}} kW ({{panels}} panels × {{panelWattage}} W)\n💰 Project cost: {{cost}}\n🎁 PM Surya Ghar subsidy: {{subsidy}}\n✅ Net cost: {{netCost}}\n📉 Savings: ~{{savings}} every month\n⏱ Payback: ~{{payback}} years\n🏦 Or EMI from {{emi}}/month ({{loanTenure}} yrs)\n\nShall we book a FREE site survey this week?",
  },
  {
    key: "appointment_confirmation",
    name: "Site visit confirmation",
    category: "UTILITY",
    body: "✅ Confirmed, {{name}}! {{salesperson}} from {{company}} will visit on {{date}} at {{time}} for your free solar site survey.\n\nPlease keep your latest EB bill and roof access ready. Contact: {{salespersonPhone}}",
  },
  {
    key: "appointment_reminder",
    name: "Visit reminder",
    category: "UTILITY",
    body: "⏰ Reminder: {{salesperson}} from {{company}} will meet you on {{date}} at {{time}}. Reply here if you need to reschedule.",
  },
  {
    key: "finance_options",
    name: "Solar loan / EMI offer",
    category: "MARKETING",
    body: "Hi {{name}}, going solar doesn't need a big upfront payment 🏦\n\nWith collateral-free solar loans at ~7% p.a., your EMI can be about {{emi}}/month for {{loanTenure}} years — while you save ~{{savings}} every month on electricity.\n\nShall our loan desk help you with the documents?",
  },
  {
    key: "followup_nudge",
    name: "Follow-up nudge",
    category: "MARKETING",
    body: "Hi {{name}}, checking in on your rooftop solar plan ☀️ The PM Surya Ghar subsidy of up to ₹78,000 is available right now. Any questions I can help with? — {{salesperson}}, {{company}}",
  },
  {
    key: "quotation_sent",
    name: "Quotation shared",
    category: "UTILITY",
    body: "Hi {{name}}, here is your solar proposal {{quoteNumber}} for a {{kw}} kW system.\n\nNet cost after subsidy: {{netCost}}\nValid till: {{validUntil}}\n\nView: {{quoteLink}}\n\nReply YES to confirm your booking or ask me anything!",
  },
  {
    key: "quote_expiring",
    name: "Quotation expiring",
    category: "UTILITY",
    body: "Hi {{name}}, your solar proposal {{quoteNumber}} is valid till {{validUntil}}. Confirm now to lock today's price and subsidy slot. Need any changes? — {{salesperson}}",
  },
  {
    key: "won_welcome",
    name: "Booking confirmed — welcome",
    category: "UTILITY",
    body: "🎉 Welcome to the {{company}} solar family, {{name}}! Your {{kw}} kW project is confirmed.\n\nNext steps: PM Surya Ghar registration → DISCOM feasibility → installation → net-meter → subsidy. We'll update you at every step.",
  },
  {
    key: "disqualified_nurture",
    name: "Not a fit right now",
    category: "MARKETING",
    body: "Thank you {{name}} for your interest in solar. Based on the details shared, rooftop solar may not be the right fit right now. We'll keep you posted on new schemes that could work for you. 🙏 — {{company}}",
  },
];

export const DEFAULT_RULES: {
  name: string;
  description: string;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  delayMinutes?: number;
  active?: boolean;
}[] = [
  {
    name: "Welcome every new lead on WhatsApp",
    description: "Instant reply within seconds of the enquiry and a call task for the tele-caller.",
    trigger: "LEAD_CREATED",
    conditions: [],
    actions: [
      { type: "SEND_WHATSAPP", templateKey: "welcome" },
      { type: "CREATE_TASK", title: "Call new lead", dueInHours: 1, priority: "HIGH" },
    ],
  },
  {
    name: "Send instant estimate when lead qualifies",
    description: "Uses the EB bill to send system size, subsidy, savings and EMI.",
    trigger: "LEAD_QUALIFIED",
    conditions: [],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "proposal_estimate" }],
  },
  {
    name: "Hot lead alert",
    description: "Alert the team and create a 4-hour task to book the site visit.",
    trigger: "TEMPERATURE_CHANGED",
    conditions: [{ field: "temperature", op: "eq", value: "HOT" }],
    actions: [
      { type: "NOTIFY_MANAGERS", title: "🔥 Lead turned HOT" },
      { type: "NOTIFY_ASSIGNEE", title: "🔥 Your lead is HOT — book the site visit" },
      { type: "CREATE_TASK", title: "Book site visit (hot lead)", dueInHours: 4, priority: "HIGH" },
    ],
  },
  {
    name: "Finance objection → loan offer",
    description: "When finance is the blocker, share the EMI-vs-savings message.",
    trigger: "TEMPERATURE_CHANGED",
    conditions: [{ field: "objection", op: "eq", value: "FINANCE" }],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "finance_options" }],
  },
  {
    name: "Confirm site visit on WhatsApp",
    description: "Sent as soon as a site visit is booked.",
    trigger: "APPOINTMENT_BOOKED",
    conditions: [{ field: "appointmentType", op: "eq", value: "SITE_VISIT" }],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "appointment_confirmation" }],
  },
  {
    name: "Reminder 24 hours before visit",
    description: "Reduces no-shows.",
    trigger: "APPOINTMENT_REMINDER",
    conditions: [],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "appointment_reminder" }],
    delayMinutes: 1440,
  },
  {
    name: "Reminder 2 hours before visit",
    description: "Final reminder on the day.",
    trigger: "APPOINTMENT_REMINDER",
    conditions: [],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "appointment_reminder" }],
    delayMinutes: 120,
  },
  {
    name: "Quotation failed GPS/time check",
    description: "Managers review quotations not created at the customer's site or slot.",
    trigger: "QUOTATION_FLAGGED",
    conditions: [],
    actions: [{ type: "NOTIFY_MANAGERS", title: "⚠ Quotation failed location/time validation" }],
  },
  {
    name: "Share quotation on WhatsApp",
    description: "Sends the proposal link when a quotation is marked sent.",
    trigger: "QUOTATION_SENT",
    conditions: [],
    actions: [
      { type: "SEND_WHATSAPP", templateKey: "quotation_sent" },
      { type: "CREATE_TASK", title: "Follow up on quotation", dueInHours: 48 },
    ],
  },
  {
    name: "Re-engage silent hot/warm leads (3 days)",
    description: "Nudge and create a call task when nobody has spoken to a good lead in 3 days.",
    trigger: "NO_RESPONSE",
    conditions: [{ field: "temperature", op: "in", value: ["HOT", "WARM"] }],
    actions: [
      { type: "SEND_WHATSAPP", templateKey: "followup_nudge" },
      { type: "CREATE_TASK", title: "Call — no contact for 3 days", dueInHours: 4, priority: "HIGH" },
    ],
    delayMinutes: 4320,
  },
  {
    name: "Quotation expiring in 2 days",
    description: "Creates urgency before the price lapses.",
    trigger: "QUOTATION_EXPIRING",
    conditions: [],
    actions: [
      { type: "SEND_WHATSAPP", templateKey: "quote_expiring" },
      { type: "CREATE_TASK", title: "Quotation expiring — call to close", dueInHours: 8, priority: "HIGH" },
    ],
    delayMinutes: 2880,
  },
  {
    name: "Welcome won customers",
    description: "Booking confirmation and next steps.",
    trigger: "STAGE_CHANGED",
    conditions: [{ field: "stage", op: "eq", value: "WON" }],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "won_welcome" }],
  },
  {
    name: "Polite close for disqualified leads",
    description: "Off by default — enable if you want to message disqualified enquiries.",
    trigger: "LEAD_DISQUALIFIED",
    conditions: [],
    actions: [{ type: "SEND_WHATSAPP", templateKey: "disqualified_nurture" }],
    active: false,
  },
];

export const PROJECT_STAGES = [
  { key: "BOOKING_CONFIRMED", label: "Booking confirmed", hint: "Advance received, order signed" },
  { key: "DOCUMENTATION", label: "Documentation", hint: "Aadhaar, EB bill, bank details, roof photos" },
  { key: "PORTAL_REGISTRATION", label: "PM Surya Ghar registration", hint: "pmsuryaghar.gov.in application" },
  { key: "DISCOM_FEASIBILITY", label: "DISCOM feasibility", hint: "Technical feasibility approval" },
  { key: "DESIGN_APPROVED", label: "Design approved", hint: "Layout, SLD and BOM finalised" },
  { key: "MATERIAL_DISPATCHED", label: "Material dispatched", hint: "Panels, inverter, structure delivered" },
  { key: "INSTALLATION", label: "Installation", hint: "Structure, modules, wiring, earthing" },
  { key: "NET_METER_APPLIED", label: "Net-meter applied", hint: "Bi-directional meter request" },
  { key: "DISCOM_INSPECTION", label: "DISCOM inspection", hint: "Inspection & meter installation" },
  { key: "COMMISSIONED", label: "Commissioned", hint: "System live, commissioning report uploaded" },
  { key: "SUBSIDY_APPLIED", label: "Subsidy applied", hint: "Bank details submitted on portal" },
  { key: "SUBSIDY_RECEIVED", label: "Subsidy received", hint: "CFA credited to customer" },
  { key: "CLOSED", label: "Closed", hint: "Handover complete, AMC active" },
] as const;

// Who gets the auto-assigned task when a project enters each stage — editable in Settings → Project workflow.
// primaryUserId/coordinatorUserId default to null (unassigned) since user ids are per-tenant.
export const PROJECT_WORKFLOW_DEFAULTS: { stage: string; taskTitle: string; dueInDays: number; primaryUserId: string | null; coordinatorUserId: string | null }[] = [
  { stage: "BOOKING_CONFIRMED", taskTitle: "Call the customer, confirm booking and advance", dueInDays: 1, primaryUserId: null, coordinatorUserId: null },
  { stage: "DOCUMENTATION", taskTitle: "Collect Aadhaar, EB bill, bank details and roof photos", dueInDays: 3, primaryUserId: null, coordinatorUserId: null },
  { stage: "PORTAL_REGISTRATION", taskTitle: "Submit PM Surya Ghar portal application", dueInDays: 2, primaryUserId: null, coordinatorUserId: null },
  { stage: "DISCOM_FEASIBILITY", taskTitle: "Follow up with DISCOM for feasibility approval", dueInDays: 5, primaryUserId: null, coordinatorUserId: null },
  { stage: "DESIGN_APPROVED", taskTitle: "Finalise layout, SLD and BOM with customer sign-off", dueInDays: 2, primaryUserId: null, coordinatorUserId: null },
  { stage: "MATERIAL_DISPATCHED", taskTitle: "Confirm material dispatch and site readiness", dueInDays: 2, primaryUserId: null, coordinatorUserId: null },
  { stage: "INSTALLATION", taskTitle: "Complete installation and capture site/geo-tag photos", dueInDays: 3, primaryUserId: null, coordinatorUserId: null },
  { stage: "NET_METER_APPLIED", taskTitle: "File net-meter application with DISCOM", dueInDays: 2, primaryUserId: null, coordinatorUserId: null },
  { stage: "DISCOM_INSPECTION", taskTitle: "Coordinate DISCOM inspection and bi-directional meter fitting", dueInDays: 5, primaryUserId: null, coordinatorUserId: null },
  { stage: "COMMISSIONED", taskTitle: "Upload commissioning certificate", dueInDays: 1, primaryUserId: null, coordinatorUserId: null },
  { stage: "SUBSIDY_APPLIED", taskTitle: "Submit subsidy claim with customer bank details", dueInDays: 2, primaryUserId: null, coordinatorUserId: null },
  { stage: "SUBSIDY_RECEIVED", taskTitle: "Confirm subsidy credited and notify customer", dueInDays: 2, primaryUserId: null, coordinatorUserId: null },
  { stage: "CLOSED", taskTitle: "Final handover review and AMC enrolment", dueInDays: 1, primaryUserId: null, coordinatorUserId: null },
];

export const PROJECT_CHECKLIST = [
  { key: "aadhaar", label: "Aadhaar card" },
  { key: "ebBill", label: "Latest electricity bill" },
  { key: "bankPassbook", label: "Cancelled cheque / bank passbook" },
  { key: "propertyProof", label: "Property tax receipt / ownership proof" },
  { key: "roofPhotos", label: "Roof photos & site survey report" },
  { key: "agreement", label: "Signed agreement / work order" },
  { key: "portalApplication", label: "National portal application submitted" },
  { key: "feasibilityLetter", label: "DISCOM feasibility approval" },
  { key: "installationPhotos", label: "Installation photos with geo-tag" },
  { key: "commissioningReport", label: "Commissioning certificate" },
  { key: "netMeterInstalled", label: "Net-meter installed" },
  { key: "subsidyRequest", label: "Subsidy request raised" },
] as const;
