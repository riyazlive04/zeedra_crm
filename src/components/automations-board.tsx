"use client";

import { TimeAgo } from "./time-ago";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Zap, Plus, Trash2, MessageCircle, CheckSquare, Bell, Users, CalendarClock, Clock, Pencil, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, Field } from "./ui";
import { Modal } from "./modal";
import { api } from "@/lib/client";
import { useToast } from "./toast";
import { ACTION_LABELS, CONDITION_FIELDS, TRIGGERS, type Action, type Condition, type Trigger } from "@/lib/automation/types";
import { humanize } from "@/lib/text";

export interface Rule {
  id: string;
  name: string;
  description: string | null;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  delayMinutes: number;
  active: boolean;
  runCount: number;
  lastRunAt: string | null;
}

const ACTION_ICON: Record<Action["type"], React.ReactNode> = {
  SEND_WHATSAPP: <MessageCircle className="h-3.5 w-3.5" />,
  CREATE_TASK: <CheckSquare className="h-3.5 w-3.5" />,
  NOTIFY_ASSIGNEE: <Bell className="h-3.5 w-3.5" />,
  NOTIFY_MANAGERS: <Users className="h-3.5 w-3.5" />,
  SET_FOLLOW_UP: <CalendarClock className="h-3.5 w-3.5" />,
};

function describeAction(a: Action, templates: Record<string, string>) {
  switch (a.type) {
    case "SEND_WHATSAPP":
      return `WhatsApp: ${templates[a.templateKey] ?? a.templateKey}`;
    case "CREATE_TASK":
      return `Task "${a.title}" due in ${a.dueInHours}h`;
    case "NOTIFY_ASSIGNEE":
    case "NOTIFY_MANAGERS":
      return `${ACTION_LABELS[a.type]}: "${a.title}"`;
    case "SET_FOLLOW_UP":
      return `Follow-up in ${a.inHours}h`;
  }
}

function describeDelay(m: number) {
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"}`;
  if (m >= 60 && m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${m} min`;
}

export function AutomationsBoard({ rules, templates, errors }: { rules: Rule[]; templates: { key: string; name: string }[]; errors: { ruleId: string; detail: string | null; createdAt: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const tmap = Object.fromEntries(templates.map((t) => [t.key, t.name]));

  async function toggle(r: Rule) {
    try {
      await api(`/api/automations/${r.id}`, { method: "PATCH", body: { active: !r.active } });
      toast.success(r.active ? "Automation paused" : "Automation activated");
      router.refresh();
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New automation
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rules.map((r) => {
          const errs = errors.filter((e) => e.ruleId === r.id);
          return (
            <Card key={r.id} className={clsx("p-4", !r.active && "opacity-60")}>
              <div className="flex items-start gap-3">
                <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", r.active ? "sun-gradient text-white" : "bg-slate-100 text-slate-400")}>
                  <Zap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{r.name}</h3>
                    <button
                      role="switch"
                      aria-checked={r.active}
                      onClick={() => toggle(r)}
                      className={clsx("relative h-5 w-9 shrink-0 rounded-full transition", r.active ? "bg-emerald-500" : "bg-slate-300")}
                      aria-label={r.active ? "Pause" : "Activate"}
                    >
                      <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition", r.active ? "left-[18px]" : "left-0.5")} />
                    </button>
                  </div>
                  {r.description && <p className="text-xs text-slate-500">{r.description}</p>}
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-10 font-semibold text-slate-400">WHEN</span>
                      <Badge tone="violet">
                        {TRIGGERS[r.trigger]?.kind === "schedule" ? <Clock className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                        {TRIGGERS[r.trigger]?.label.replace(/\s*\(.*\)/, "") ?? r.trigger}
                        {TRIGGERS[r.trigger]?.kind === "schedule" && ` · ${describeDelay(r.delayMinutes)}`}
                      </Badge>
                    </div>
                    {r.conditions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-10 font-semibold text-slate-400">IF</span>
                        {r.conditions.map((c, i) => (
                          <Badge key={i} tone="slate">
                            {CONDITION_FIELDS[c.field]?.label ?? c.field} {c.op === "eq" ? "is" : c.op === "neq" ? "is not" : c.op === "in" ? "in" : c.op === "gte" ? "≥" : "≤"}{" "}
                            {Array.isArray(c.value) ? c.value.map(humanize).join(" / ") : humanize(String(c.value))}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-start gap-1.5">
                      <span className="w-10 pt-0.5 font-semibold text-slate-400">THEN</span>
                      <div className="flex flex-col gap-1">
                        {r.actions.map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 text-slate-700">
                            <span className="text-emerald-600">{ACTION_ICON[a.type]}</span>
                            {describeAction(a, tmap)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {errs.length > 0 && (
                    <p className="mt-2 flex gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Last error: {errs[0].detail}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                    <span>
                      Ran {r.runCount.toLocaleString("en-IN")} times{r.lastRunAt && (
                        <>
                          {" "}· last <TimeAgo date={r.lastRunAt} />
                        </>
                      )}
                    </span>
                    <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-sun-700">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {editing && <RuleEditor rule={editing === "new" ? null : editing} templates={templates} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleEditor({ rule, templates, onClose }: { rule: Rule | null; templates: { key: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [trigger, setTrigger] = useState<Trigger>(rule?.trigger ?? "LEAD_CREATED");
  const [conditions, setConditions] = useState<Condition[]>(rule?.conditions ?? []);
  const [actions, setActions] = useState<Action[]>(rule?.actions ?? [{ type: "SEND_WHATSAPP", templateKey: templates[0]?.key ?? "" }]);
  const [delay, setDelay] = useState(rule?.delayMinutes ?? 60);
  const [busy, setBusy] = useState(false);
  const scheduled = TRIGGERS[trigger].kind === "schedule";

  async function save() {
    setBusy(true);
    try {
      const body = { name, description: description || null, trigger, conditions, actions, delayMinutes: scheduled ? delay : 0 };
      if (rule) await api(`/api/automations/${rule.id}`, { method: "PATCH", body });
      else await api("/api/automations", { body: { ...body, active: true } });
      toast.success("Automation saved");
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!rule || !confirm(`Delete "${rule.name}"?`)) return;
    try {
      await api(`/api/automations/${rule.id}`, { method: "DELETE" });
      toast.success("Automation deleted");
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Delete failed", e instanceof Error ? e.message : undefined);
    }
  }

  const setAction = (i: number, a: Action) => setActions((xs) => xs.map((x, j) => (j === i ? a : x)));
  const blank: Record<Action["type"], Action> = {
    SEND_WHATSAPP: { type: "SEND_WHATSAPP", templateKey: templates[0]?.key ?? "" },
    CREATE_TASK: { type: "CREATE_TASK", title: "Follow up", dueInHours: 24, priority: "NORMAL" },
    NOTIFY_ASSIGNEE: { type: "NOTIFY_ASSIGNEE", title: "Lead needs attention" },
    NOTIFY_MANAGERS: { type: "NOTIFY_MANAGERS", title: "Lead needs attention" },
    SET_FOLLOW_UP: { type: "SET_FOLLOW_UP", inHours: 24 },
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={rule ? "Edit automation" : "New automation"}
      footer={
        <>
          {rule && (
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={name.trim().length < 3 || !actions.length}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Send loan offer to finance objections" />
          </Field>
          <Field label="Description">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
          <div className="mb-2 text-xs font-bold text-violet-800">WHEN</div>
          <select className="input" value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}>
            {(Object.keys(TRIGGERS) as Trigger[]).map((t) => (
              <option key={t} value={t}>
                {TRIGGERS[t].label}
              </option>
            ))}
          </select>
          {scheduled && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="number" min={5} className="input w-28" value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
              minutes ({describeDelay(delay)}) — checked by the scheduler every few minutes
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">IF (all must match)</span>
            <Button size="xs" onClick={() => setConditions((c) => [...c, { field: "temperature", op: "eq", value: "HOT" }])}>
              <Plus className="h-3 w-3" /> Condition
            </Button>
          </div>
          {conditions.length === 0 && <p className="text-xs text-slate-400">No conditions — runs for every matching event.</p>}
          <div className="space-y-2">
            {conditions.map((c, i) => {
              const meta = CONDITION_FIELDS[c.field];
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    className="input h-8 w-auto py-0 text-xs"
                    value={c.field}
                    onChange={(e) => {
                      const f = e.target.value as Condition["field"];
                      const opts = CONDITION_FIELDS[f].options;
                      setConditions((xs) => xs.map((x, j) => (j === i ? { field: f, op: opts ? "eq" : "gte", value: opts ? opts[0] : 0 } : x)));
                    }}
                  >
                    {(Object.keys(CONDITION_FIELDS) as Condition["field"][]).map((f) => (
                      <option key={f} value={f}>
                        {CONDITION_FIELDS[f].label}
                      </option>
                    ))}
                  </select>
                  <select className="input h-8 w-auto py-0 text-xs" value={c.op} onChange={(e) => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition["op"], value: e.target.value === "in" ? [String(x.value)] : Array.isArray(x.value) ? x.value[0] : x.value } : x)))}>
                    {(meta.options ? ["eq", "neq", "in"] : ["gte", "lte", "eq"]).map((o) => (
                      <option key={o} value={o}>
                        {{ eq: "is", neq: "is not", in: "is any of", gte: "≥", lte: "≤" }[o]}
                      </option>
                    ))}
                  </select>
                  {meta.options ? (
                    c.op === "in" ? (
                      <div className="flex flex-wrap gap-1">
                        {meta.options.map((o) => {
                          const vals = Array.isArray(c.value) ? c.value : [];
                          const on = vals.includes(o);
                          return (
                            <button
                              type="button"
                              key={o}
                              onClick={() => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, value: on ? vals.filter((v) => v !== o) : [...vals, o] } : x)))}
                              className={clsx("rounded-md border px-1.5 py-0.5 text-[11px]", on ? "border-sun-500 bg-sun-50 text-sun-800" : "border-slate-200 text-slate-500")}
                            >
                              {humanize(o)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <select className="input h-8 w-auto py-0 text-xs" value={String(c.value)} onChange={(e) => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
                        {meta.options.map((o) => (
                          <option key={o} value={o}>
                            {humanize(o)}
                          </option>
                        ))}
                      </select>
                    )
                  ) : (
                    <input type="number" className="input h-8 w-28 text-xs" value={Number(c.value)} onChange={(e) => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)))} />
                  )}
                  <button onClick={() => setConditions((xs) => xs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600" aria-label="Remove condition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">THEN</span>
            <select className="input h-7 w-auto py-0 text-xs" value="" onChange={(e) => e.target.value && setActions((xs) => [...xs, blank[e.target.value as Action["type"]]])}>
              <option value="">+ Add action</option>
              {(Object.keys(ACTION_LABELS) as Action["type"][]).map((t) => (
                <option key={t} value={t}>
                  {ACTION_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-100">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <span className="text-emerald-600">{ACTION_ICON[a.type]}</span>
                  {ACTION_LABELS[a.type]}
                </span>
                {a.type === "SEND_WHATSAPP" && (
                  <select className="input h-8 w-auto flex-1 py-0 text-xs" value={a.templateKey} onChange={(e) => setAction(i, { ...a, templateKey: e.target.value })}>
                    {templates.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                {(a.type === "CREATE_TASK" || a.type === "NOTIFY_ASSIGNEE" || a.type === "NOTIFY_MANAGERS") && (
                  <input className="input h-8 flex-1 text-xs" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                )}
                {a.type === "CREATE_TASK" && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    due in <input type="number" min={0} className="input h-8 w-16 text-xs" value={a.dueInHours} onChange={(e) => setAction(i, { ...a, dueInHours: Number(e.target.value) })} /> h
                  </span>
                )}
                {a.type === "SET_FOLLOW_UP" && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    in <input type="number" min={0} className="input h-8 w-16 text-xs" value={a.inHours} onChange={(e) => setAction(i, { ...a, inHours: Number(e.target.value) })} /> hours
                  </span>
                )}
                <button onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))} className="ml-auto text-slate-400 hover:text-rose-600" aria-label="Remove action">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
