import "server-only";
import type { Lead, Prisma } from "@prisma/client";
import { db } from "../db";
import { sendWhatsApp } from "../whatsapp";
import { logActivity, notify } from "../activity";
import { leadTemplateVars } from "../automation/engine";
import { evaluateConditions } from "../automation/types";
import {
  DEFAULT_SETTINGS, FLOW_QUIET_MINUTES, isOptIn, isOptOut, matchReply, matchesKeyword, nextNodeId, nextSendTime, triggerNode,
  type Audience, type FlowAction, type FlowGraph, type FlowSettings,
} from "./types";

const MAX_STEPS_PER_TICK = 25;

type FlowRow = { id: string; organizationId: string; name: string; graph: Prisma.JsonValue; settings: Prisma.JsonValue };

export function parseGraph(raw: unknown): FlowGraph {
  const g = (raw ?? {}) as Partial<FlowGraph>;
  return { nodes: Array.isArray(g.nodes) ? g.nodes : [], edges: Array.isArray(g.edges) ? g.edges : [] };
}
export function parseSettings(raw: unknown): FlowSettings {
  return { ...DEFAULT_SETTINGS, ...((raw ?? {}) as Partial<FlowSettings>) };
}

async function logStep(runId: string, flowId: string, nodeId: string, outcome: string) {
  await db.flowStep.create({ data: { runId, flowId, nodeId, outcome: outcome.slice(0, 200) } });
}

/** Puts a lead into a flow (unless already in it, or re-entry is off and it ran before) and runs it. */
export async function startFlow(flow: FlowRow, leadId: string, opts: { interactive?: boolean; force?: boolean } = {}): Promise<string | null> {
  const graph = parseGraph(flow.graph);
  const settings = parseSettings(flow.settings);
  const start = triggerNode(graph);
  if (!start) return null;
  // Leads who replied STOP never enter a flow (manual, broadcast, keyword or event).
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { whatsappOptIn: true } });
  if (!lead?.whatsappOptIn) return null;
  const existing = await db.flowRun.findFirst({
    where: { flowId: flow.id, leadId, ...(settings.reentry || opts.force ? { status: { in: ["ACTIVE", "WAITING_REPLY"] } } : {}) },
    select: { id: true },
  });
  if (existing) return null;
  const run = await db.flowRun.create({
    data: { organizationId: flow.organizationId, flowId: flow.id, leadId, currentNodeId: start.id, status: "ACTIVE", nextRunAt: new Date() },
  });
  await logStep(run.id, flow.id, start.id, "entered");
  await logActivity({ orgId: flow.organizationId, leadId, type: "AUTOMATION", title: `Entered WhatsApp flow: ${flow.name}` });
  // Move past the start node and run until the first pause.
  await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: nextNodeId(graph, start.id, "next") } });
  await advanceRun(run.id, { interactive: opts.interactive });
  return run.id;
}

/** Event hook: called from fireTrigger for every automation trigger. */
export async function startFlowsForTrigger(trigger: string, ctx: { orgId: string; leadId?: string | null; extra?: Record<string, unknown> }) {
  if (!ctx.leadId) return 0;
  const flows = await db.flow.findMany({ where: { organizationId: ctx.orgId, active: true } });
  if (!flows.length) return 0;
  const lead = await db.lead.findFirst({ where: { id: ctx.leadId, organizationId: ctx.orgId } });
  if (!lead) return 0;
  let started = 0;
  for (const f of flows) {
    const t = triggerNode(parseGraph(f.graph));
    if (!t || t.data.trigger !== trigger) continue;
    if (!evaluateConditions(t.data.conditions ?? [], { ...lead, ...(ctx.extra ?? {}) })) continue;
    if (await startFlow(f, lead.id)) started++;
  }
  return started;
}

/** Tells the lead's salesperson, or the managers when nobody is assigned, so a request is never lost. */
async function notifyOwner(lead: Lead, title: string, body: string, href: string) {
  if (lead.assignedToId) return void (await notify(lead.organizationId, lead.assignedToId, title, body, href));
  const managers = await db.user.findMany({ where: { organizationId: lead.organizationId, active: true, role: { in: ["OWNER", "ADMIN", "SALES_MANAGER"] } }, select: { id: true } });
  await Promise.all(managers.map((m) => notify(lead.organizationId, m.id, title, body, href)));
}

/**
 * Has a flow just messaged this lead (or is about to, held by quiet hours)? Automation rules use this
 * to skip their own WhatsApp message so the lead doesn't get two welcomes.
 */
export async function flowOwnsConversation(leadId: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - FLOW_QUIET_MINUTES * 60_000);
  const recent = await db.whatsAppMessage.count({ where: { leadId, direction: "OUT", flowId: { not: null }, status: { not: "FAILED" }, createdAt: { gte: since } } });
  if (recent) return true;
  const held = await db.flowRun.count({ where: { leadId, status: "ACTIVE", startedAt: { gte: since }, nextRunAt: { gt: now } } });
  return held > 0;
}

/** Is the lead currently travelling through any flow? */
export async function inActiveFlow(leadId: string): Promise<boolean> {
  return (await db.flowRun.count({ where: { leadId, status: { in: ["ACTIVE", "WAITING_REPLY"] } } })) > 0;
}

async function runFlowAction(action: FlowAction, lead: Lead, flowName: string) {
  switch (action.type) {
    case "CREATE_TASK":
      await db.task.create({
        data: {
          organizationId: lead.organizationId,
          leadId: lead.id,
          assignedToId: lead.assignedToId,
          title: `${action.title} · ${lead.name}`,
          dueAt: new Date(Date.now() + action.dueInHours * 3_600_000),
          priority: action.priority ?? "NORMAL",
        },
      });
      return;
    case "NOTIFY_ASSIGNEE":
      await notifyOwner(lead, action.title, `${lead.name} · ${lead.code} (${flowName})`, `/whatsapp?lead=${lead.id}`);
      return;
    case "NOTIFY_MANAGERS": {
      const managers = await db.user.findMany({ where: { organizationId: lead.organizationId, active: true, role: { in: ["OWNER", "ADMIN", "SALES_MANAGER"] } }, select: { id: true } });
      await Promise.all(managers.map((m) => notify(lead.organizationId, m.id, action.title, `${lead.name} · ${lead.code} (${flowName})`, `/leads/${lead.id}`)));
      return;
    }
    case "SET_FOLLOW_UP":
      await db.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: new Date(Date.now() + action.inHours * 3_600_000) } });
      return;
    case "SET_TEMPERATURE":
      await db.lead.update({ where: { id: lead.id }, data: { temperature: action.value } });
      return;
    case "SET_STAGE":
      await db.lead.update({ where: { id: lead.id }, data: { stage: action.value as Lead["stage"] } });
      return;
  }
}

/**
 * Walks a run forward from its current node until it has to pause (wait, wait-for-reply, quiet
 * hours) or finishes. `interactive` = triggered by the customer's own message, so quiet hours
 * don't apply (a bot should answer someone who just wrote to it).
 */
export async function advanceRun(runId: string, opts: { interactive?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const run = await db.flowRun.findUnique({ where: { id: runId }, include: { flow: true, lead: true } });
  if (!run || (run.status !== "ACTIVE" && run.status !== "WAITING_REPLY")) return;
  const graph = parseGraph(run.flow.graph);
  const settings = parseSettings(run.flow.settings);
  const lead = run.lead;
  const finish = (status: string, stopReason?: string) =>
    db.flowRun.update({ where: { id: run.id }, data: { status, stopReason: stopReason ?? null, nextRunAt: null, currentNodeId: null } });

  if (settings.stopStages.includes(lead.stage)) return void (await finish("STOPPED", `Lead is ${lead.stage}`));
  if (!lead.whatsappOptIn) return void (await finish("STOPPED", "Opted out of WhatsApp"));

  let nodeId = run.currentNodeId;
  for (let i = 0; i < MAX_STEPS_PER_TICK; i++) {
    if (!nodeId) return void (await finish("COMPLETED"));
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return void (await finish("FAILED", "Step was deleted from the flow"));
    const d = node.data;
    const go = async (handle: string, outcome: string) => {
      await logStep(run.id, run.flowId, node.id, outcome);
      nodeId = nextNodeId(graph, node.id, handle);
      await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: nodeId, status: "ACTIVE" } });
    };
    switch (d.kind) {
      case "trigger":
        await go("next", "entered");
        break;
      case "end":
        await logStep(run.id, run.flowId, node.id, "ended");
        return void (await finish("COMPLETED"));
      case "message": {
        if (!opts.interactive) {
          const at = nextSendTime(now, settings.quietStart, settings.quietEnd);
          if (at > now) return void (await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: node.id, nextRunAt: at, status: "ACTIVE" } }));
        }
        try {
          const vars = await leadTemplateVars(lead);
          const r = await sendWhatsApp({
            orgId: run.organizationId,
            phone: lead.phone,
            templateKey: d.templateKey || undefined,
            body: d.templateKey ? undefined : renderLocal(d.body, vars),
            vars,
            buttons: d.buttons,
            leadId: lead.id,
            automated: true,
            flowId: run.flowId,
            flowNodeId: node.id,
          });
          await go("next", r.status === "FAILED" ? `failed: ${r.error ?? "send failed"}` : "sent");
        } catch (e) {
          await logStep(run.id, run.flowId, node.id, `failed: ${e instanceof Error ? e.message : String(e)}`);
          return void (await finish("FAILED", e instanceof Error ? e.message : "Send failed"));
        }
        break;
      }
      case "wait": {
        await logStep(run.id, run.flowId, node.id, "waiting");
        const target = nextNodeId(graph, node.id, "next");
        return void (await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: target, nextRunAt: new Date(now.getTime() + d.minutes * 60_000), status: "ACTIVE" } }));
      }
      case "waitReply":
        await logStep(run.id, run.flowId, node.id, "waiting for reply");
        return void (await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: node.id, status: "WAITING_REPLY", nextRunAt: new Date(now.getTime() + d.timeoutMinutes * 60_000) } }));
      case "condition": {
        const fresh = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
        const yes = evaluateConditions(d.conditions ?? [], fresh as unknown as Record<string, unknown>);
        await go(yes ? "yes" : "no", yes ? "yes" : "no");
        break;
      }
      case "action":
        try {
          await runFlowAction(d.action, lead, run.flow.name);
          await go("next", "done");
        } catch (e) {
          await go("next", `failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        break;
    }
  }
  // Safety valve: yield and continue on the next cron tick.
  await db.flowRun.update({ where: { id: run.id }, data: { nextRunAt: new Date(now.getTime() + 60_000) } });
}

function renderLocal(body: string, vars: Record<string, unknown>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
}

/**
 * Inbound WhatsApp hook (webhook). Order matters:
 *  1. STOP / START opt-out handling.
 *  2. A run waiting for this lead's reply takes the matching branch.
 *  3. Other running flows stop if they're set to hand over on reply.
 *  4. Keyword-triggered flows start.
 * `receivedAt` is when the message arrived: runs that started after it (e.g. a "new lead" flow fired
 * because this very message created the lead) have already answered it and must not treat it as a reply.
 * Returns true when a flow consumed (answered) the message.
 */
export async function handleInboundForFlows(orgId: string, leadId: string, text: string, opts: { receivedAt?: Date } = {}): Promise<boolean> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return false;
  const receivedAt = opts.receivedAt ?? new Date();

  if (isOptOut(text)) {
    if (!lead.whatsappOptIn) return true; // already unsubscribed: don't repeat the confirmation
    await db.lead.update({ where: { id: leadId }, data: { whatsappOptIn: false } });
    await db.flowRun.updateMany({ where: { leadId, status: { in: ["ACTIVE", "WAITING_REPLY"] } }, data: { status: "STOPPED", stopReason: "Opted out", nextRunAt: null } });
    await sendWhatsApp({ orgId, phone: lead.phone, body: "You've been unsubscribed from our WhatsApp updates. Reply START anytime to subscribe again.", leadId, automated: true });
    await logActivity({ orgId, leadId, type: "WHATSAPP", title: "Customer opted out of WhatsApp (STOP)" });
    return true;
  }
  if (isOptIn(text) && !lead.whatsappOptIn) {
    await db.lead.update({ where: { id: leadId }, data: { whatsappOptIn: true } });
    await sendWhatsApp({ orgId, phone: lead.phone, body: "Welcome back! You're subscribed to our WhatsApp updates again. ☀️", leadId, automated: true });
    await logActivity({ orgId, leadId, type: "WHATSAPP", title: "Customer opted back in to WhatsApp (START)" });
    return true;
  }
  if (!lead.whatsappOptIn) return false; // opted out: the team still sees the message, no automated replies

  const handOver = async (run: { id: string; flow: { name: string } }, reason: string) => {
    await db.flowRun.update({ where: { id: run.id }, data: { status: "STOPPED", stopReason: reason, nextRunAt: null, currentNodeId: null } });
    await notifyOwner(lead, `💬 ${lead.name} replied, over to you`, `${run.flow.name}: “${text.slice(0, 100)}”`, `/whatsapp?lead=${lead.id}`);
  };

  // A flow that started because of this very message has already answered it.
  let consumed = (await db.flowRun.count({ where: { leadId, startedAt: { gte: receivedAt } } })) > 0;
  const waiting = await db.flowRun.findMany({ where: { leadId, status: "WAITING_REPLY", startedAt: { lt: receivedAt } }, include: { flow: true } });
  for (const run of waiting) {
    const graph = parseGraph(run.flow.graph);
    const node = graph.nodes.find((n) => n.id === run.currentNodeId);
    if (!node || node.data.kind !== "waitReply") {
      await handOver(run, "Step was removed from the flow, handed to sales");
      consumed = true;
      continue;
    }
    const handle = matchReply(text, node.data.options);
    const t = triggerNode(graph);
    // The customer typed the bot's keyword again ("hi") instead of choosing: start the menu over.
    if (handle === "any" && t?.data.trigger === "KEYWORD" && matchesKeyword(text, t.data.keywords)) {
      await logStep(run.id, run.flowId, node.id, "started over");
      await db.flowRun.update({ where: { id: run.id }, data: { status: "COMPLETED", stopReason: "Customer started over", nextRunAt: null, currentNodeId: null } });
      continue;
    }
    let target = nextNodeId(graph, node.id, handle);
    if (!target && handle !== "any") target = nextNodeId(graph, node.id, "any");
    if (!target && handle === "any") {
      // Nothing in the flow handles this answer, so a person should read it.
      await logStep(run.id, run.flowId, node.id, "replied (other), handed to sales");
      await handOver(run, "Customer replied, handed to sales");
      consumed = true;
      continue;
    }
    const outcome = handle === "any" ? "replied (other)" : `option: ${node.data.options[Number(handle.slice(4))]}${target ? "" : " (no branch, so the flow ends)"}`;
    await logStep(run.id, run.flowId, node.id, outcome);
    await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: target, status: "ACTIVE", nextRunAt: new Date() } });
    await advanceRun(run.id, { interactive: true });
    consumed = true;
  }

  const active = await db.flowRun.findMany({ where: { leadId, status: "ACTIVE", startedAt: { lt: receivedAt }, id: { notIn: waiting.map((w) => w.id) } }, include: { flow: true } });
  for (const run of active) {
    if (!parseSettings(run.flow.settings).stopOnReply) continue;
    await handOver(run, "Customer replied, handed to sales");
  }

  if (!consumed) {
    const flows = await db.flow.findMany({ where: { organizationId: orgId, active: true } });
    for (const f of flows) {
      const t = triggerNode(parseGraph(f.graph));
      if (!t || t.data.trigger !== "KEYWORD" || !matchesKeyword(text, t.data.keywords)) continue;
      if (!evaluateConditions(t.data.conditions ?? [], lead as unknown as Record<string, unknown>)) continue;
      // Keyword bots should answer every time the customer asks.
      if (await startFlow(f, leadId, { interactive: true, force: true })) consumed = true;
    }
  }
  return consumed;
}

/** After a flow is edited: runs sitting on a step that no longer exists leave the flow cleanly. */
export async function stopRunsOnMissingSteps(flowId: string, graph: FlowGraph): Promise<number> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const runs = await db.flowRun.findMany({ where: { flowId, status: { in: ["ACTIVE", "WAITING_REPLY"] } }, select: { id: true, currentNodeId: true } });
  const orphaned = runs.filter((r) => r.currentNodeId && !ids.has(r.currentNodeId)).map((r) => r.id);
  if (orphaned.length)
    await db.flowRun.updateMany({ where: { id: { in: orphaned } }, data: { status: "STOPPED", stopReason: "Step was removed from the flow", nextRunAt: null, currentNodeId: null } });
  return orphaned.length;
}

/** Cron: advance due runs, fire reply timeouts, process broadcasts. */
export async function runNurture(now = new Date()) {
  const summary = { flowSteps: 0, timeouts: 0, broadcastsSent: 0 };
  const due = await db.flowRun.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: now } }, select: { id: true }, take: 300, orderBy: { nextRunAt: "asc" } });
  for (const r of due) {
    await advanceRun(r.id, { now });
    summary.flowSteps++;
  }
  const timedOut = await db.flowRun.findMany({ where: { status: "WAITING_REPLY", nextRunAt: { lte: now } }, include: { flow: true }, take: 300 });
  for (const run of timedOut) {
    const graph = parseGraph(run.flow.graph);
    const target = run.currentNodeId ? nextNodeId(graph, run.currentNodeId, "timeout") : null;
    if (run.currentNodeId) await logStep(run.id, run.flowId, run.currentNodeId, "no reply (timeout)");
    await db.flowRun.update({ where: { id: run.id }, data: { currentNodeId: target, status: "ACTIVE", nextRunAt: now } });
    await advanceRun(run.id, { now });
    summary.timeouts++;
  }
  summary.broadcastsSent = await runBroadcasts(now);
  return summary;
}

export function audienceWhere(orgId: string, a: Audience): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { organizationId: orgId, whatsappOptIn: true };
  const and: Prisma.LeadWhereInput[] = [];
  if (a.stage?.length) and.push({ stage: { in: a.stage as Lead["stage"][] } });
  if (a.temperature?.length) and.push({ temperature: { in: a.temperature as Lead["temperature"][] } });
  if (a.segment?.length) and.push({ segment: { in: a.segment as Lead["segment"][] } });
  if (a.source?.length) and.push({ source: { in: a.source as Lead["source"][] } });
  if (a.city?.trim()) and.push({ city: { contains: a.city.trim() } });
  if (a.minBill) and.push({ monthlyBill: { gte: a.minBill } });
  if (and.length) where.AND = and;
  return where;
}

const BROADCAST_BATCH = 150; // per cron tick — keeps within Meta throughput and the function timeout

async function runBroadcasts(now: Date) {
  let sent = 0;
  const list = await db.broadcast.findMany({ where: { status: { in: ["SCHEDULED", "SENDING"] }, scheduledAt: { lte: now } }, take: 5 });
  for (const b of list) {
    let queue = (b.queue as string[] | null) ?? null;
    if (b.status === "SCHEDULED" || !queue) {
      const leads = await db.lead.findMany({ where: audienceWhere(b.organizationId, (b.audience ?? {}) as Audience), select: { id: true }, take: 10000 });
      queue = leads.map((l) => l.id);
      await db.broadcast.update({ where: { id: b.id }, data: { status: "SENDING", queue, total: queue.length } });
    }
    const batch = queue.slice(0, BROADCAST_BATCH);
    const flow = b.flowId ? await db.flow.findFirst({ where: { id: b.flowId, organizationId: b.organizationId } }) : null;
    let failed = 0;
    for (const leadId of batch) {
      try {
        if (flow) {
          await startFlow(flow, leadId, { force: true });
        } else if (b.templateKey) {
          const lead = await db.lead.findUnique({ where: { id: leadId } });
          if (!lead || !lead.whatsappOptIn) continue;
          const r = await sendWhatsApp({ orgId: b.organizationId, phone: lead.phone, templateKey: b.templateKey, vars: await leadTemplateVars(lead), leadId, automated: true, broadcastId: b.id });
          if (r.status === "FAILED") failed++;
        }
        sent++;
      } catch {
        failed++;
      }
    }
    const rest = queue.slice(batch.length);
    await db.broadcast.update({ where: { id: b.id }, data: { processed: { increment: batch.length }, failed: { increment: failed } } });
    // Only a broadcast that is still sending moves on (it may have been cancelled during this batch).
    await db.broadcast.updateMany({
      where: { id: b.id, status: "SENDING" },
      data: rest.length ? { queue: rest } : { status: "SENT", completedAt: new Date(), queue: [] },
    });
  }
  return sent;
}
