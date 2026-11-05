"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { GitFork, Megaphone, BarChart3, Plus, Trash2, Loader2, Users, MessageCircle, Send, Eye, CheckCheck, XCircle, UserMinus, Bot, Link2 } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Card } from "@/components/ui";
import { CONDITION_FIELDS } from "@/lib/automation/types";
import { FLOW_RECIPES, FLOW_TRIGGER_LABELS, type Audience } from "@/lib/nurture/types";

type FlowRow = { id: string; name: string; description: string | null; active: boolean; updatedAt: string; steps: number; trigger: string; keywords: string[]; inFlow: number; completed: number; stopped: number };
type Template = { key: string; name: string; body: string; metaTemplateName: string | null };
type Analytics = { sent: number; delivered: number; read: number; failed: number; automated: number; inbound: number; optedOut: number };
type BroadcastRow = { id: string; name: string; templateKey: string | null; flowId: string | null; status: string; scheduledAt: string; total: number; processed: number; failed: number; createdAt: string; delivery: { sent: number; delivered: number; read: number; failed: number } };

/** "Connect WhatsApp Cloud" call-to-action shown wherever sends would otherwise fall back to wa.me. */
export function ConnectWhatsAppBanner({ compact }: { compact?: boolean }) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 text-amber-800", compact ? "px-2.5 py-1.5 text-[11px]" : "px-4 py-3 text-sm")}>
      <span className="flex-1">Cloud API isn't connected yet. Messages are logged and opened via wa.me, and flows run in simulation.</span>
      <Link href="/settings?tab=integrations" className={clsx("inline-flex items-center gap-1 rounded-md bg-green-600 font-semibold text-white hover:bg-green-700", compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-sm")}>
        <Link2 className={compact ? "h-3 w-3" : "h-4 w-4"} /> Connect WhatsApp Cloud
      </Link>
    </div>
  );
}

export function NurtureHome({ initialTab, connected, canEdit, flows, templates, analytics }: { initialTab: "flows" | "broadcasts" | "analytics"; connected: boolean; canEdit: boolean; flows: FlowRow[]; templates: Template[]; analytics: Analytics }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="space-y-4">
      {!connected && <ConnectWhatsAppBanner />}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
        {([["flows", "Flows", GitFork], ["broadcasts", "Broadcasts", Megaphone], ["analytics", "Analytics", BarChart3]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => { setTab(k); window.history.replaceState(null, "", `/nurture?tab=${k}`); }} className={clsx("flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium", tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>
      {tab === "flows" && <FlowsTab flows={flows} canEdit={canEdit} />}
      {tab === "broadcasts" && <BroadcastsTab canEdit={canEdit} templates={templates} flows={flows} />}
      {tab === "analytics" && <AnalyticsTab a={analytics} flows={flows} />}
    </div>
  );
}

function FlowsTab({ flows, canEdit }: { flows: FlowRow[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const create = async (recipe?: string) => {
    setBusy(recipe ?? "blank");
    try {
      const r = await api<{ id: string }>("/api/flows", { body: recipe ? { recipe } : {} });
      router.push(`/nurture/flows/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };
  const remove = async (f: FlowRow) => {
    if (!confirm(`Delete flow "${f.name}"? Leads currently in it will stop.`)) return;
    await api(`/api/flows/${f.id}`, { method: "DELETE" });
    router.refresh();
  };
  return (
    <div className="space-y-5">
      {canEdit && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Start from a recipe</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <button onClick={() => create()} disabled={!!busy} className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-teal-500 hover:text-teal-700">
              {busy === "blank" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
              <span className="mt-1 font-medium">Blank flow</span>
            </button>
            {FLOW_RECIPES.map((r) => (
              <button key={r.key} onClick={() => create(r.key)} disabled={!!busy} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-teal-500 hover:shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-slate-800">{busy === r.key ? <Loader2 className="h-4 w-4 animate-spin" /> : r.key === "menu-bot" ? <Bot className="h-4 w-4 text-violet-600" /> : <GitFork className="h-4 w-4 text-teal-600" />}{r.name}</div>
                <p className="mt-1 text-xs text-slate-500">{r.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      <Card className="overflow-hidden p-0">
        {flows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500"><GitFork className="mx-auto mb-2 h-8 w-8 text-slate-300" />No flows yet. Pick a recipe above to get started.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr><th className="px-4 py-3">Flow</th><th className="px-3 py-3">Starts when</th><th className="px-3 py-3 text-right">Steps</th><th className="px-3 py-3 text-right">In flow</th><th className="px-3 py-3 text-right">Completed</th><th className="px-3 py-3 text-right">Handed over</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flows.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><Link href={`/nurture/flows/${f.id}`} className="font-medium text-teal-700 hover:underline">{f.name}</Link><div className="text-xs text-slate-400">Edited {formatDistanceToNow(new Date(f.updatedAt), { addSuffix: true })}</div></td>
                  <td className="px-3 py-3 text-slate-600">{f.trigger === "KEYWORD" ? `Keyword: ${f.keywords.join(", ")}` : FLOW_TRIGGER_LABELS[f.trigger] ?? f.trigger}</td>
                  <td className="px-3 py-3 text-right">{f.steps}</td>
                  <td className="px-3 py-3 text-right font-semibold">{f.inFlow}</td>
                  <td className="px-3 py-3 text-right">{f.completed}</td>
                  <td className="px-3 py-3 text-right">{f.stopped}</td>
                  <td className="px-3 py-3"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", f.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>{f.active ? "● Live" : "Draft"}</span></td>
                  <td className="px-3 py-3 text-right">{canEdit && <button onClick={() => remove(f)} className="text-slate-400 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const PICKERS: { key: keyof Audience; label: string; options: readonly string[] }[] = [
  { key: "stage", label: "Stage", options: CONDITION_FIELDS.stage.options },
  { key: "temperature", label: "Temperature", options: CONDITION_FIELDS.temperature.options },
  { key: "segment", label: "Segment", options: CONDITION_FIELDS.segment.options },
  { key: "source", label: "Source", options: CONDITION_FIELDS.source.options },
];

function BroadcastsTab({ canEdit, templates, flows }: { canEdit: boolean; templates: Template[]; flows: FlowRow[] }) {
  const toast = useToast();
  const [list, setList] = useState<BroadcastRow[] | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"template" | "flow">("template");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [flowId, setFlowId] = useState(flows[0]?.id ?? "");
  const [audience, setAudience] = useState<Audience>({ stage: [], temperature: [], segment: [], source: [], city: "", minBill: null });
  const [preview, setPreview] = useState<{ count: number; sample: { name: string; code: string }[] } | null>(null);
  const [when, setWhen] = useState("");
  const [sending, setSending] = useState(false);
  const load = () => api<BroadcastRow[]>("/api/broadcasts").then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => api<{ count: number; sample: { name: string; code: string }[] }>("/api/broadcasts/preview", { body: audience }).then(setPreview).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [audience]);
  const toggle = (k: keyof Audience, v: string) => {
    const cur = (audience[k] as string[] | undefined) ?? [];
    setAudience({ ...audience, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const send = async () => {
    if (!name.trim()) return toast.error("Give the broadcast a name");
    if (!preview?.count) return toast.error("No opted-in leads match this audience");
    if (!confirm(`Send to ${preview.count} lead(s)${when ? ` on ${new Date(when).toLocaleString("en-IN")}` : " now"}?`)) return;
    setSending(true);
    try {
      await api("/api/broadcasts", {
        body: { name, templateKey: mode === "template" ? templateKey : null, flowId: mode === "flow" ? flowId : null, audience: { ...audience, minBill: audience.minBill || null }, scheduledAt: when ? new Date(when).toISOString() : null },
      });
      toast.success(when ? "Broadcast scheduled" : "Broadcast sending");
      setName("");
      load();
    } catch (e) {
      toast.error("Couldn't send", (e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const tpl = templates.find((t) => t.key === templateKey);
  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      {canEdit && (
        <Card className="h-fit space-y-4 p-5 text-sm">
          <h3 className="font-semibold text-slate-800">New broadcast</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali subsidy offer" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
            <button onClick={() => setMode("template")} className={clsx("rounded-md py-1.5", mode === "template" ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>Send a template</button>
            <button onClick={() => setMode("flow")} className={clsx("rounded-md py-1.5", mode === "flow" ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>Start a flow</button>
          </div>
          {mode === "template" ? (
            <div>
              <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2">
                {templates.map((t) => <option key={t.key} value={t.key}>{t.name}{t.metaTemplateName ? " ✓" : ""}</option>)}
              </select>
              {tpl && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#e5ddd5] p-2 text-xs text-slate-700"><span className="block rounded-md bg-white p-2">{tpl.body}</span></p>}
              {tpl && !tpl.metaTemplateName && <p className="mt-1 text-xs text-amber-700">Not Meta-approved: it will only reach leads who messaged you in the last 24 h.</p>}
            </div>
          ) : (
            <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <div className="space-y-2">
            <div className="font-medium text-slate-700">Audience <span className="font-normal text-slate-400">(opted-in leads only)</span></div>
            {PICKERS.map((p) => (
              <div key={p.key}>
                <div className="mb-1 text-xs text-slate-500">{p.label}</div>
                <div className="flex flex-wrap gap-1">
                  {p.options.map((o) => {
                    const on = ((audience[p.key] as string[]) ?? []).includes(o);
                    return <button key={o} onClick={() => toggle(p.key, o)} className={clsx("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500")}>{o.replace(/_/g, " ").toLowerCase()}</button>;
                  })}
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={audience.city ?? ""} onChange={(e) => setAudience({ ...audience, city: e.target.value })} placeholder="City contains…" className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
              <input type="number" value={audience.minBill ?? ""} onChange={(e) => setAudience({ ...audience, minBill: e.target.value ? Number(e.target.value) : null })} placeholder="Min bill ₹" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
            </div>
            <div className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
              <Users className="mr-1 inline h-3.5 w-3.5" /><b>{preview?.count ?? "…"}</b> lead(s){preview?.sample.length ? `, e.g. ${preview.sample.map((s) => s.name).join(", ")}` : ""}
            </div>
          </div>
          <label className="block text-xs text-slate-500">Schedule (leave empty to send now)
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <button onClick={send} disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {when ? "Schedule broadcast" : "Send now"}
          </button>
          <p className="text-[11px] text-slate-400">Sends in batches of 150 every scheduler tick to respect WhatsApp limits. Leads who replied STOP are never included.</p>
        </Card>
      )}
      <Card className="overflow-hidden p-0">
        {list === null ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500"><Megaphone className="mx-auto mb-2 h-8 w-8 text-slate-300" />No broadcasts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr><th className="px-4 py-3">Broadcast</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Audience</th><th className="px-3 py-3 text-right">Sent</th><th className="px-3 py-3 text-right">Delivered</th><th className="px-3 py-3 text-right">Read</th><th className="px-3 py-3 text-right">Failed</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3"><div className="font-medium">{b.name}</div><div className="text-xs text-slate-400">{b.flowId ? "Starts a flow" : b.templateKey} · {new Date(b.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div></td>
                  <td className="px-3 py-3"><span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", b.status === "SENT" ? "bg-green-100 text-green-700" : b.status === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-sky-100 text-sky-700")}>{b.status.toLowerCase()}{b.status === "SENDING" ? ` ${b.processed}/${b.total}` : ""}</span></td>
                  <td className="px-3 py-3 text-right">{b.total}</td>
                  <td className="px-3 py-3 text-right">{b.flowId ? b.processed : b.delivery.sent}</td>
                  <td className="px-3 py-3 text-right">{b.flowId ? "-" : b.delivery.delivered}</td>
                  <td className="px-3 py-3 text-right">{b.flowId ? "-" : b.delivery.read}</td>
                  <td className="px-3 py-3 text-right">{b.failed + (b.flowId ? 0 : b.delivery.failed)}</td>
                  <td className="px-3 py-3 text-right">
                    {canEdit && (b.status === "SCHEDULED" || b.status === "SENDING") && (
                      <button onClick={async () => { await api(`/api/broadcasts/${b.id}`, { method: "DELETE" }); load(); }} className="text-xs text-red-600 hover:underline">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AnalyticsTab({ a, flows }: { a: Analytics; flows: FlowRow[] }) {
  const pct = (x: number) => (a.sent ? `${Math.round((x / a.sent) * 100)}%` : "-");
  const tiles: [string, string | number, string, typeof Send][] = [
    ["Messages sent", a.sent, `${a.automated} automated`, Send],
    ["Delivered", a.delivered, pct(a.delivered), CheckCheck],
    ["Read", a.read, pct(a.read), Eye],
    ["Customer replies", a.inbound, "inbound messages", MessageCircle],
    ["Failed", a.failed, pct(a.failed), XCircle],
    ["Opted out", a.optedOut, "replied STOP", UserMinus],
  ];
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Last 30 days. Delivered / read come from WhatsApp receipts and need the Cloud API to be connected.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([l, v, s, Icon]) => (
          <Card key={l} className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" />{l}</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{v.toLocaleString("en-IN")}</div>
            <div className="text-xs text-slate-400">{s}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Flow performance</h3>
        {flows.length === 0 ? <p className="text-sm text-slate-500">No flows yet.</p> : (
          <div className="space-y-3">
            {flows.map((f) => {
              const total = f.inFlow + f.completed + f.stopped || 1;
              return (
                <div key={f.id}>
                  <div className="mb-1 flex justify-between text-xs"><Link href={`/nurture/flows/${f.id}`} className="font-medium text-teal-700 hover:underline">{f.name}</Link><span className="text-slate-500">{f.inFlow + f.completed + f.stopped} leads</span></div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-sky-500" style={{ width: `${(f.inFlow / total) * 100}%` }} title={`${f.inFlow} in flow`} />
                    <div className="bg-green-500" style={{ width: `${(f.completed / total) * 100}%` }} title={`${f.completed} completed`} />
                    <div className="bg-amber-500" style={{ width: `${(f.stopped / total) * 100}%` }} title={`${f.stopped} handed over / stopped`} />
                  </div>
                </div>
              );
            })}
            <div className="flex gap-4 text-[11px] text-slate-500"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />In flow</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />Completed</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Handed over / stopped</span></div>
          </div>
        )}
      </Card>
    </div>
  );
}
