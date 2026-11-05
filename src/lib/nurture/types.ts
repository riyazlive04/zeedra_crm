// Shared (client + server) vocabulary for WhatsApp nurture flows — pure, no DB.
import type { Condition, Trigger } from "../automation/types";

export type FlowTriggerKind = Trigger | "KEYWORD" | "MANUAL";

export type FlowAction =
  | { type: "CREATE_TASK"; title: string; dueInHours: number; priority?: "LOW" | "NORMAL" | "HIGH" }
  | { type: "NOTIFY_ASSIGNEE"; title: string }
  | { type: "NOTIFY_MANAGERS"; title: string }
  | { type: "SET_FOLLOW_UP"; inHours: number }
  | { type: "SET_TEMPERATURE"; value: "HOT" | "WARM" | "COLD" }
  | { type: "SET_STAGE"; value: string };

export type FlowNodeData =
  | { kind: "trigger"; trigger: FlowTriggerKind; keywords: string[]; conditions: Condition[] }
  | { kind: "message"; templateKey: string | null; body: string; buttons: string[] }
  | { kind: "wait"; minutes: number }
  | { kind: "waitReply"; options: string[]; timeoutMinutes: number }
  | { kind: "condition"; conditions: Condition[] }
  | { kind: "action"; action: FlowAction }
  | { kind: "end" };

export type NodeKind = FlowNodeData["kind"];

export interface FlowNode {
  id: string;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  /** Output handle: "next" | "yes" | "no" | "opt:<i>" | "any" | "timeout". */
  sourceHandle: string;
  target: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowSettings {
  /** Stop the run if the customer replies while it is not waiting for a reply (hand over to sales). */
  stopOnReply: boolean;
  /** Stop the run when the lead reaches one of these pipeline stages. */
  stopStages: string[];
  /** No automated sends between quietStart and quietEnd (site-local hour, 0–23). */
  quietStart: number;
  quietEnd: number;
  /** Allow a lead to enter this flow again after finishing it. */
  reentry: boolean;
}

export const DEFAULT_SETTINGS: FlowSettings = { stopOnReply: true, stopStages: ["WON", "LOST", "DISQUALIFIED"], quietStart: 21, quietEnd: 9, reentry: false };

export const NODE_META: Record<NodeKind, { label: string; color: string; hint: string }> = {
  trigger: { label: "Start", color: "#0d9488", hint: "When a lead enters the flow" },
  message: { label: "Send message", color: "#16a34a", hint: "WhatsApp template or text, optional quick-reply buttons" },
  wait: { label: "Wait", color: "#64748b", hint: "Pause before the next step" },
  waitReply: { label: "Wait for reply", color: "#7c3aed", hint: "Branch on the customer's answer" },
  condition: { label: "Condition", color: "#d97706", hint: "Yes / No branch on lead fields" },
  action: { label: "Action", color: "#2563eb", hint: "Task, notification, follow-up, temperature or stage" },
  end: { label: "End", color: "#94a3b8", hint: "Finish the flow" },
};

export const FLOW_TRIGGER_LABELS: Record<string, string> = {
  LEAD_CREATED: "New lead created",
  LEAD_QUALIFIED: "Lead passes qualification",
  TEMPERATURE_CHANGED: "Temperature changes",
  STAGE_CHANGED: "Pipeline stage changes",
  APPOINTMENT_BOOKED: "Appointment booked",
  QUOTATION_SENT: "Quotation sent",
  PROJECT_STAGE_CHANGED: "Installation stage changes",
  KEYWORD: "Customer sends a keyword",
  MANUAL: "Manually / from a broadcast",
};

export const ACTION_TYPE_LABELS: Record<FlowAction["type"], string> = {
  CREATE_TASK: "Create follow-up task",
  NOTIFY_ASSIGNEE: "Notify salesperson",
  NOTIFY_MANAGERS: "Notify managers",
  SET_FOLLOW_UP: "Set next follow-up",
  SET_TEMPERATURE: "Set temperature",
  SET_STAGE: "Move pipeline stage",
};

/** Output handles a node exposes, in display order. */
export function outputHandles(d: FlowNodeData): { id: string; label: string }[] {
  switch (d.kind) {
    case "trigger":
    case "message":
    case "wait":
    case "action":
      return [{ id: "next", label: "" }];
    case "condition":
      return [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
    case "waitReply":
      return [
        ...d.options.map((o, i) => ({ id: `opt:${i}`, label: o || `Option ${i + 1}` })),
        { id: "any", label: "Any other reply" },
        { id: "timeout", label: "No reply" },
      ];
    case "end":
      return [];
  }
}

// "cancel" is deliberately not here: customers say it about site visits, not about WhatsApp.
export const OPT_OUT_WORDS = ["stop", "unsubscribe", "stop all", "opt out", "optout"];
export const OPT_IN_WORDS = ["start", "subscribe", "unstop"];

const norm = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ");

export function isOptOut(text: string) {
  return OPT_OUT_WORDS.includes(norm(text));
}
export function isOptIn(text: string) {
  return OPT_IN_WORDS.includes(norm(text));
}

/**
 * Which branch a reply takes on a wait-for-reply node: exact/partial option text, or the option's
 * number ("1", "2" …) for customers who type instead of tapping buttons. Falls back to "any".
 */
export function matchReply(text: string, options: string[]): string {
  const t = norm(text);
  if (!t) return "any";
  const exact = options.findIndex((o) => norm(o) === t);
  if (exact >= 0) return `opt:${exact}`;
  const num = Number(t);
  if (Number.isInteger(num) && num >= 1 && num <= options.length) return `opt:${num - 1}`;
  const partial = options.findIndex((o) => norm(o) && (t.includes(norm(o)) || norm(o).includes(t)) && t.length >= 2);
  if (partial >= 0) return `opt:${partial}`;
  return "any";
}

/** Does an inbound message start a KEYWORD-triggered flow? Whole-word, case-insensitive. */
export function matchesKeyword(text: string, keywords: string[]) {
  const t = ` ${norm(text)} `;
  return keywords.some((k) => norm(k) && t.includes(` ${norm(k)} `));
}

/**
 * Earliest moment ≥ `now` outside quiet hours, using the site's UTC offset (India = +5.5).
 * quietStart > quietEnd means the quiet window wraps midnight (e.g. 21 → 9).
 */
export function nextSendTime(now: Date, quietStart: number, quietEnd: number, tzOffsetHours = 5.5): Date {
  if (quietStart === quietEnd) return now;
  const local = new Date(now.getTime() + tzOffsetHours * 3600000);
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  const inQuiet = quietStart > quietEnd ? h >= quietStart || h < quietEnd : h >= quietStart && h < quietEnd;
  if (!inQuiet) return now;
  const target = new Date(local);
  target.setUTCHours(quietEnd, 0, 0, 0);
  if (target.getTime() <= local.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - tzOffsetHours * 3600000);
}

export function nextNodeId(graph: FlowGraph, from: string, handle: string): string | null {
  return graph.edges.find((e) => e.source === from && e.sourceHandle === handle)?.target ?? null;
}

export function triggerNode(graph: FlowGraph) {
  return graph.nodes.find((n) => n.data.kind === "trigger") as (FlowNode & { data: Extract<FlowNodeData, { kind: "trigger" }> }) | undefined;
}

/** Problems that would stop a flow from working — shown before activating. */
export function validateFlow(graph: FlowGraph): string[] {
  const issues: string[] = [];
  const triggers = graph.nodes.filter((n) => n.data.kind === "trigger");
  if (triggers.length !== 1) issues.push("A flow needs exactly one Start node");
  const t = triggers[0];
  if (t && t.data.kind === "trigger" && t.data.trigger === "KEYWORD" && !t.data.keywords.filter(Boolean).length) issues.push("Add at least one keyword to the Start node");
  if (t && !nextNodeId(graph, t.id, "next")) issues.push("Connect the Start node to a first step");
  for (const n of graph.nodes) {
    const d = n.data;
    if (d.kind === "message") {
      if (!d.templateKey && !d.body.trim()) issues.push("A message node has no template or text");
      if (d.buttons.length > 3) issues.push("WhatsApp allows at most 3 quick-reply buttons");
      if (d.buttons.some((b) => b.length > 20)) issues.push("Quick-reply buttons must be 20 characters or less");
    }
    if (d.kind === "waitReply" && d.timeoutMinutes <= 0) issues.push("A wait-for-reply node needs a timeout");
    if (d.kind === "wait" && d.minutes <= 0) issues.push("A wait node needs a duration");
  }
  // Cycles without a wait would loop forever inside one cron tick.
  const pausing = new Set(graph.nodes.filter((n) => n.data.kind === "wait" || n.data.kind === "waitReply").map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  const state = new Map<string, number>();
  let cyclic = false;
  const dfs = (id: string) => {
    if (cyclic || pausing.has(id)) return;
    state.set(id, 1);
    for (const nx of adj.get(id) ?? []) {
      if (pausing.has(nx)) continue;
      if (state.get(nx) === 1) { cyclic = true; return; }
      if (!state.get(nx)) dfs(nx);
    }
    state.set(id, 2);
  };
  for (const n of graph.nodes) if (!state.get(n.id)) dfs(n.id);
  if (cyclic) issues.push("A loop must include a Wait or Wait-for-reply step");
  return [...new Set(issues)];
}

/** Left-to-right mind-map layout: each node sits right of its parent, children stacked vertically. */
export function autoLayout(graph: FlowGraph, dx = 300, dy = 150): FlowGraph {
  const root = triggerNode(graph) ?? graph.nodes[0];
  if (!root) return graph;
  const children = (id: string) =>
    graph.edges
      .filter((e) => e.source === id)
      .sort((a, b) => handleOrder(a.sourceHandle) - handleOrder(b.sourceHandle))
      .map((e) => e.target);
  const pos = new Map<string, { x: number; y: number }>();
  const seen = new Set<string>();
  let cursor = 0;
  const place = (id: string, depth: number): number => {
    if (seen.has(id)) return pos.get(id)?.y ?? cursor * dy;
    seen.add(id);
    const kids = children(id).filter((k) => !seen.has(k));
    if (!kids.length) {
      const y = cursor++ * dy;
      pos.set(id, { x: depth * dx, y });
      return y;
    }
    const ys = kids.map((k) => place(k, depth + 1));
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    pos.set(id, { x: depth * dx, y });
    return y;
  };
  place(root.id, 0);
  // Orphans (not reachable yet) go underneath.
  for (const n of graph.nodes) if (!pos.has(n.id)) pos.set(n.id, { x: 0, y: cursor++ * dy + dy });
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: pos.get(n.id)! })) };
}

function handleOrder(h: string) {
  if (h === "next" || h === "yes") return 0;
  if (h === "no") return 1;
  if (h.startsWith("opt:")) return Number(h.slice(4));
  if (h === "any") return 90;
  return 99;
}

/**
 * Deleting reply option `index` of a wait-for-reply node: its branch goes, and the branches of later
 * options move up one slot so each stays attached to the same answer.
 */
export function removeReplyOption<E extends { source: string; sourceHandle?: string | null }>(edges: E[], nodeId: string, index: number): E[] {
  return edges.flatMap((e) => {
    if (e.source !== nodeId || !e.sourceHandle?.startsWith("opt:")) return [e];
    const i = Number(e.sourceHandle.slice(4));
    if (i === index) return [];
    return i > index ? [{ ...e, sourceHandle: `opt:${i - 1}` }] : [e];
  });
}

/** Drops edges that point at missing steps or at outputs a step no longer has (one link per output). */
export function sanitizeGraph(graph: FlowGraph): FlowGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const edges = graph.edges.filter((e) => {
    const src = byId.get(e.source);
    if (!src || !byId.has(e.target) || e.source === e.target) return false;
    if (!outputHandles(src.data).some((h) => h.id === e.sourceHandle)) return false;
    const k = `${e.source}:${e.sourceHandle}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { nodes: graph.nodes, edges };
}

/** WhatsApp's customer-service window: free text / buttons only reach people who wrote in the last 24 h. */
export const SERVICE_WINDOW_MINUTES = 1440;

export interface FlowWarning {
  nodeId: string | null;
  text: string;
}

/**
 * Non-blocking advice shown in the editor. Mainly: which message steps can go out when the customer
 * hasn't written in the last 24 hours, so they need a Meta-approved template on the live Cloud API.
 * Walks every path, tracking the worst case "minutes since the customer last wrote".
 */
export function flowWarnings(graph: FlowGraph, templates: { key: string; metaTemplateName: string | null }[]): FlowWarning[] {
  const out: FlowWarning[] = [];
  const start = triggerNode(graph);
  if (!start) return out;
  const approved = new Set(templates.filter((t) => t.metaTemplateName).map((t) => t.key));
  const customerWroteFirst = start.data.trigger === "KEYWORD" || start.data.trigger === "WHATSAPP_RECEIVED";
  const CLOSED = Number.POSITIVE_INFINITY;
  const worst = new Map<string, number>();
  const queue: [string, number][] = [];
  const push = (id: string | null, m: number) => {
    if (!id) return;
    const v = m >= SERVICE_WINDOW_MINUTES ? CLOSED : m;
    const cur = worst.get(id);
    if (cur !== undefined && cur >= v) return;
    worst.set(id, v);
    queue.push([id, v]);
  };
  const firstId = nextNodeId(graph, start.id, "next");
  push(firstId, customerWroteFirst ? 0 : CLOSED);
  while (queue.length) {
    const [id, m] = queue.shift()!;
    if (worst.get(id) !== m) continue;
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) continue;
    for (const e of graph.edges.filter((x) => x.source === id)) {
      const d = node.data;
      if (d.kind === "wait") push(e.target, m + d.minutes);
      else if (d.kind === "waitReply") push(e.target, e.sourceHandle === "timeout" ? m + d.timeoutMinutes : 0);
      else push(e.target, m);
    }
  }
  // First message the customer gets (straight line from the start, before any pause).
  let first: string | null = firstId;
  for (let i = 0; first && i < 50; i++) {
    const n = graph.nodes.find((x) => x.id === first);
    if (!n || n.data.kind === "message" || n.data.kind === "wait" || n.data.kind === "waitReply") break;
    first = nextNodeId(graph, n.id, n.data.kind === "condition" ? "yes" : "next");
  }
  for (const n of graph.nodes) {
    const d = n.data;
    if (d.kind !== "message" || !worst.has(n.id)) continue;
    const isApproved = !!d.templateKey && approved.has(d.templateKey);
    if (worst.get(n.id) === CLOSED && !isApproved) {
      out.push({
        nodeId: n.id,
        text:
          n.id === first && !customerWroteFirst
            ? "The first message is not a Meta-approved template. On live WhatsApp, new leads from forms and ads won't receive it. Pick an approved template for this step."
            : "This message can go out more than 24 hours after the customer last wrote. On live WhatsApp it needs a Meta-approved template, or it won't be delivered.",
      });
    }
    const buttons = d.buttons.map((b) => b.trim()).filter(Boolean);
    if (buttons.length && isApproved)
      out.push({ nodeId: n.id, text: "Quick-reply buttons aren't added to Meta templates. Add the buttons to the template in WhatsApp Manager instead." });
    if (buttons.length) {
      const nx = graph.nodes.find((x) => x.id === nextNodeId(graph, n.id, "next"));
      if (!nx || nx.data.kind !== "waitReply")
        out.push({ nodeId: n.id, text: "This message has buttons but no Wait for reply step after it, so the tap can't choose a branch." });
      else {
        const opts = nx.data.options.map(norm);
        const missing = buttons.filter((b) => !opts.includes(norm(b)));
        if (missing.length) out.push({ nodeId: nx.id, text: `Button "${missing[0]}" has no matching reply option, so tapping it goes to "Any other reply".` });
      }
    }
  }
  return out;
}

/**
 * Automation-rule triggers whose WhatsApp message a live flow replaces. For these, a rule's
 * SEND_WHATSAPP is skipped when a flow has just messaged the lead (the flow owns the conversation).
 * Transactional messages (appointment confirmations and reminders, quotation links, won welcome) are
 * never skipped because flows don't carry that information.
 */
export const FLOW_OWNED_TRIGGERS: readonly string[] = ["LEAD_CREATED", "LEAD_QUALIFIED", "LEAD_DISQUALIFIED", "TEMPERATURE_CHANGED", "NO_RESPONSE", "WHATSAPP_RECEIVED"];

/** How long after a flow message a "flow-owned" rule stays quiet. */
export const FLOW_QUIET_MINUTES = 10;

/** Rule triggers that fire at (almost) the same moment as a flow trigger, for the editor's overlap warning. */
export function overlappingRuleTriggers(trigger: string): string[] {
  if (trigger === "LEAD_CREATED") return ["LEAD_CREATED", "LEAD_QUALIFIED", "LEAD_DISQUALIFIED"];
  if (trigger === "KEYWORD") return ["WHATSAPP_RECEIVED"];
  if (trigger === "MANUAL") return [];
  return [trigger];
}

// ─── Ready-made solar nurture recipes ──────────────────────────────────

let seq = 0;
const nid = (p: string) => `${p}${++seq}`;

function chain(defs: [string, FlowNodeData][], links: [string, string, string][]): FlowGraph {
  const nodes = defs.map(([id, data]) => ({ id, position: { x: 0, y: 0 }, data }));
  const edges = links.map(([source, sourceHandle, target]) => ({ id: `e-${source}-${sourceHandle}-${target}`, source, sourceHandle, target }));
  return autoLayout({ nodes, edges });
}

export const FLOW_RECIPES: { key: string; name: string; description: string; build: () => FlowGraph }[] = [
  {
    key: "new-lead",
    name: "New enquiry nurture (7 days)",
    description: "Welcome → savings estimate → subsidy explainer → EMI → site-visit offer, branching on interest.",
    build: () => {
      seq = 0;
      const t = nid("t"), m1 = nid("m"), r1 = nid("r"), m2 = nid("m"), a1 = nid("a"), m3 = nid("m"), w1 = nid("w"), m4 = nid("m"), w2 = nid("w"), m5 = nid("m"), r2 = nid("r"), a2 = nid("a"), m6 = nid("m"), e = nid("e");
      return chain(
        [
          [t, { kind: "trigger", trigger: "LEAD_CREATED", keywords: [], conditions: [] }],
          [m1, { kind: "message", templateKey: null, body: "Hi {{name}} 👋 Thanks for your interest in rooftop solar with {{company}}! Based on your bill of {{bill}}, a {{kw}} kW system can save you about {{savings}} every month.\n\nWould you like a free site visit?", buttons: ["Yes, book visit", "Send details", "Not now"] }],
          [r1, { kind: "waitReply", options: ["Yes, book visit", "Send details", "Not now"], timeoutMinutes: 1440 }],
          [m2, { kind: "message", templateKey: null, body: "Great! {{salesperson}} will call you shortly to fix a convenient time. 📅", buttons: [] }],
          [a1, { kind: "action", action: { type: "SET_TEMPERATURE", value: "HOT" } }],
          [m3, { kind: "message", templateKey: null, body: "Here's your estimate, {{name}}:\n☀️ System: {{kw}} kW ({{panels}} panels)\n💰 Cost: {{cost}}\n🏛️ PM Surya Ghar subsidy: {{subsidy}}\n✅ Net cost: {{netCost}}\n📉 Payback: {{payback}} years", buttons: [] }],
          [w1, { kind: "wait", minutes: 2 * 1440 }],
          [m4, { kind: "message", templateKey: null, body: "Did you know? Under PM Surya Ghar, the government credits up to ₹78,000 subsidy directly to your bank account. We handle the full portal application for you. 🙌", buttons: [] }],
          [w2, { kind: "wait", minutes: 2 * 1440 }],
          [m5, { kind: "message", templateKey: null, body: "Solar can pay for itself: with a loan, your EMI is about {{emi}}/month for {{loanTenure}} years, often less than your current EB bill.\n\nShall we arrange a free site survey?", buttons: ["Yes please", "Maybe later"] }],
          [r2, { kind: "waitReply", options: ["Yes please", "Maybe later"], timeoutMinutes: 2 * 1440 }],
          [a2, { kind: "action", action: { type: "CREATE_TASK", title: "Call: interested in site visit (WhatsApp flow)", dueInHours: 2, priority: "HIGH" } }],
          [m6, { kind: "message", templateKey: null, body: "No problem, {{name}}! Reply anytime and we'll be happy to help. ☀️", buttons: [] }],
          [e, { kind: "end" }],
        ],
        [
          [t, "next", m1], [m1, "next", r1],
          [r1, "opt:0", m2], [m2, "next", a1], [a1, "next", a2],
          [r1, "opt:1", m3], [m3, "next", w1], [w1, "next", m4], [m4, "next", w2], [w2, "next", m5], [m5, "next", r2],
          [r1, "opt:2", m6],
          [r1, "timeout", m3],
          [r2, "opt:0", a2], [r2, "opt:1", m6], [r2, "timeout", e],
        ],
      );
    },
  },
  {
    key: "menu-bot",
    name: "WhatsApp menu bot",
    description: "Customer types HI / MENU → numbered menu → answers about price, subsidy, or hand-off to a person.",
    build: () => {
      seq = 0;
      const t = nid("t"), m = nid("m"), r = nid("r"), p = nid("m"), s = nid("m"), h = nid("m"), n = nid("a");
      return chain(
        [
          [t, { kind: "trigger", trigger: "KEYWORD", keywords: ["hi", "hello", "menu", "solar"], conditions: [] }],
          [m, { kind: "message", templateKey: null, body: "Welcome to {{company}} ☀️ How can we help?\n1️⃣ Price for my home\n2️⃣ Government subsidy\n3️⃣ Talk to an expert", buttons: ["Price", "Subsidy", "Talk to expert"] }],
          [r, { kind: "waitReply", options: ["Price", "Subsidy", "Talk to expert"], timeoutMinutes: 720 }],
          [p, { kind: "message", templateKey: null, body: "A typical 3 kW home system costs about ₹1.9 lakh, and after the ₹78,000 subsidy it's ~₹1.1 lakh. Share your monthly EB bill and we'll send your exact estimate!", buttons: [] }],
          [s, { kind: "message", templateKey: null, body: "PM Surya Ghar subsidy: ₹30,000 per kW for the first 2 kW and ₹18,000 for the 3rd kW, up to ₹78,000, credited to your bank. We do the paperwork. ✅", buttons: [] }],
          [h, { kind: "message", templateKey: null, body: "Sure! {{salesperson}} will reach you shortly. 📞", buttons: [] }],
          [n, { kind: "action", action: { type: "NOTIFY_ASSIGNEE", title: "🙋 Customer asked to talk to an expert on WhatsApp" } }],
        ],
        [[t, "next", m], [m, "next", r], [r, "opt:0", p], [r, "opt:1", s], [r, "opt:2", h], [h, "next", n], [r, "any", h]],
      );
    },
  },
  {
    key: "quote-followup",
    name: "Quotation follow-up",
    description: "After a quotation is sent: check-in after 1 day, objection handling, and a nudge to the salesperson.",
    build: () => {
      seq = 0;
      const t = nid("t"), w = nid("w"), m = nid("m"), r = nid("r"), y = nid("a"), q = nid("m"), q2 = nid("a"), c = nid("m");
      return chain(
        [
          [t, { kind: "trigger", trigger: "QUOTATION_SENT", keywords: [], conditions: [] }],
          [w, { kind: "wait", minutes: 1440 }],
          [m, { kind: "message", templateKey: null, body: "Hi {{name}}, did you get a chance to review your solar quotation? Any questions?", buttons: ["Ready to go", "Have a question", "Price is high"] }],
          [r, { kind: "waitReply", options: ["Ready to go", "Have a question", "Price is high"], timeoutMinutes: 2 * 1440 }],
          [y, { kind: "action", action: { type: "CREATE_TASK", title: "Close the deal: customer is ready (WhatsApp)", dueInHours: 1, priority: "HIGH" } }],
          [q, { kind: "message", templateKey: null, body: "Of course! {{salesperson}} will call you to answer it. 😊", buttons: [] }],
          [q2, { kind: "action", action: { type: "NOTIFY_ASSIGNEE", title: "❓ Customer has a question about the quotation" } }],
          [c, { kind: "message", templateKey: null, body: "We understand, {{name}}. With a solar loan the EMI is about {{emi}}/month, and your bill drops by ~{{savings}}. Want us to share EMI options?", buttons: [] }],
        ],
        [[t, "next", w], [w, "next", m], [m, "next", r], [r, "opt:0", y], [r, "opt:1", q], [q, "next", q2], [r, "opt:2", c], [r, "any", q2]],
      );
    },
  },
];

export function blankFlow(): FlowGraph {
  return {
    nodes: [{ id: "t1", position: { x: 0, y: 0 }, data: { kind: "trigger", trigger: "LEAD_CREATED", keywords: [], conditions: [] } }],
    edges: [],
  };
}

export interface Audience {
  stage?: string[];
  temperature?: string[];
  segment?: string[];
  source?: string[];
  city?: string;
  minBill?: number | null;
}
