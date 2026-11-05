"use client";

import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, applyNodeChanges, applyEdgeChanges, useReactFlow,
  type Node, type Edge, type NodeProps, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";
import clsx from "clsx";
import {
  ArrowLeft, Plus, Save, Check, Loader2, Trash2, Wand2, Settings2, BarChart3, UserPlus, X, MessageCircle, Clock, Reply, GitBranch, Zap, Flag, Play, AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { CONDITION_FIELDS, TRIGGERS, type Condition } from "@/lib/automation/types";
import {
  ACTION_TYPE_LABELS, autoLayout, DEFAULT_SETTINGS, FLOW_OWNED_TRIGGERS, FLOW_TRIGGER_LABELS, flowWarnings, NODE_META, outputHandles, overlappingRuleTriggers,
  removeReplyOption, validateFlow,
  type FlowAction, type FlowGraph, type FlowNodeData, type FlowSettings, type FlowWarning, type NodeKind,
} from "@/lib/nurture/types";

export interface FlowInit {
  id: string;
  name: string;
  active: boolean;
  graph: FlowGraph;
  settings: FlowSettings;
}
type Template = { key: string; name: string; body: string; active: boolean; metaTemplateName: string | null };
type RuleRef = { id: string; name: string; trigger: string };
type FlowRef = { id: string; name: string; trigger: string; keywords: string[] };
type NodeStats = Record<string, { entered: number; outcomes: Record<string, number>; sent: number; delivered: number; read: number; failed: number }>;
type Stats = { nodes: NodeStats; totals: Record<string, number>; runs: { id: string; status: string; currentNodeId: string | null; nextRunAt: string | null; stopReason: string | null; startedAt: string; lead: { id: string; name: string; code: string } }[] };

const ICONS: Record<NodeKind, typeof MessageCircle> = { trigger: Play, message: MessageCircle, wait: Clock, waitReply: Reply, condition: GitBranch, action: Zap, end: Flag };
const SAMPLE_VARS: Record<string, string> = {
  name: "Ravi", fullName: "Ravi Kumar", company: "Zeedra Solar", bill: "₹3,000", kw: "3", panels: "6", cost: "₹1,90,000", subsidy: "₹78,000",
  netCost: "₹1,12,000", savings: "₹2,600", payback: "3.6", emi: "₹2,450", loanTenure: "5", salesperson: "Anitha", city: "Chennai",
};
const VAR_CHIPS = ["name", "bill", "kw", "savings", "subsidy", "netCost", "emi", "payback", "salesperson", "company"];

function defaultData(kind: NodeKind): FlowNodeData {
  switch (kind) {
    case "trigger": return { kind, trigger: "LEAD_CREATED", keywords: [], conditions: [] };
    case "message": return { kind, templateKey: null, body: "Hi {{name}}, ", buttons: [] };
    case "wait": return { kind, minutes: 1440 };
    case "waitReply": return { kind, options: ["Yes", "No"], timeoutMinutes: 1440 };
    case "condition": return { kind, conditions: [{ field: "temperature", op: "eq", value: "HOT" }] };
    case "action": return { kind, action: { type: "NOTIFY_ASSIGNEE", title: "Follow up with this lead" } };
    case "end": return { kind };
  }
}

function fmtMinutes(m: number) {
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${m} min`;
}
const render = (body: string) => body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => SAMPLE_VARS[k] ?? `{{${k}}}`);

function summary(d: FlowNodeData, templates: Template[]): string {
  switch (d.kind) {
    case "trigger":
      return d.trigger === "KEYWORD" ? `Keyword: ${d.keywords.join(", ") || "-"}` : FLOW_TRIGGER_LABELS[d.trigger] ?? d.trigger;
    case "message": {
      const t = d.templateKey ? templates.find((x) => x.key === d.templateKey) : null;
      const text = t ? t.body : d.body;
      return (t ? `📄 ${t.name}: ` : "") + render(text).slice(0, 90) + (text.length > 90 ? "…" : "");
    }
    case "wait": return `Wait ${fmtMinutes(d.minutes)}`;
    case "waitReply": return `Up to ${fmtMinutes(d.timeoutMinutes)}`;
    case "condition": return d.conditions.map((c) => `${CONDITION_FIELDS[c.field]?.label ?? c.field} ${c.op === "eq" ? "=" : c.op === "neq" ? "≠" : c.op === "gte" ? "≥" : c.op === "lte" ? "≤" : "in"} ${Array.isArray(c.value) ? c.value.join("/") : c.value}`).join(" and ") || "Always yes";
    case "action": return ACTION_TYPE_LABELS[d.action.type] + ("title" in d.action ? `: ${d.action.title}` : "value" in d.action ? `: ${d.action.value}` : "inHours" in d.action ? ` in ${d.action.inHours} h` : "");
    case "end": return "Flow finishes";
  }
}

// Shared editor state for custom nodes (keeps functions out of the saved graph).
const Ctx = createContext<{ templates: Template[]; stats: NodeStats | null; onAdd: (nodeId: string, handle: string, x: number, y: number) => void; connected: Set<string>; warned: Map<string, string[]> }>({
  templates: [], stats: null, onAdd: () => {}, connected: new Set(), warned: new Map(),
});

function FlowNodeCard({ id, data, selected }: NodeProps<Node<FlowNodeData>>) {
  const { templates, stats, onAdd, connected, warned } = useContext(Ctx);
  const warn = warned.get(id);
  const meta = NODE_META[data.kind];
  const Icon = ICONS[data.kind];
  const outs = outputHandles(data);
  const st = stats?.[id];
  return (
    <div className={clsx("w-[250px] rounded-xl border-2 bg-white shadow-md transition", selected ? "shadow-xl" : "")} style={{ borderColor: selected ? meta.color : `${meta.color}55` }}>
      {data.kind !== "trigger" && <Handle type="target" position={Position.Left} id="in" className="!h-3 !w-3 !border-2 !border-white" style={{ background: meta.color }} />}
      <div className="flex items-center gap-2 rounded-t-[10px] px-3 py-1.5 text-xs font-semibold text-white" style={{ background: meta.color }}>
        <Icon className="h-3.5 w-3.5" /> {meta.label}
        {warn && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] text-amber-950" title={warn.join("\n")}>⚠ Check</span>}
        {st && (
          <span className="ml-auto rounded-full bg-white/25 px-1.5 text-[10px]" title="Leads that reached this step">
            👥 {st.entered}
          </span>
        )}
      </div>
      <div className="whitespace-pre-line px-3 py-2 text-[11.5px] leading-snug text-slate-700">{summary(data, templates)}</div>
      {data.kind === "message" && data.buttons.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {data.buttons.map((b) => <span key={b} className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">{b}</span>)}
        </div>
      )}
      {st && data.kind === "message" && (
        <div className="flex gap-2 border-t border-slate-100 px-3 py-1 text-[10px] text-slate-500">
          <span title="Sent">✓ {st.sent}</span><span title="Delivered">✓✓ {st.delivered}</span><span className="text-sky-600" title="Read">👁 {st.read}</span>{st.failed > 0 && <span className="text-red-600">✕ {st.failed}</span>}
        </div>
      )}
      {outs.length > 0 && (
        <div className="border-t border-slate-100 py-1">
          {outs.map((h) => {
            const count = st ? Object.entries(st.outcomes).filter(([k]) => outcomeHandle(k, data) === h.id).reduce((a, [, v]) => a + v, 0) : 0;
            const linked = connected.has(`${id}:${h.id}`);
            return (
              <div key={h.id} className="relative flex items-center justify-end gap-1.5 py-1 pl-3 pr-4 text-[10.5px] text-slate-500">
                {h.label && <span className="truncate">{h.label}</span>}
                {st && h.label && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">{count}</span>}
                {!linked && (
                  <button
                    type="button"
                    title="Add next step"
                    onClick={(e) => { e.stopPropagation(); onAdd(id, h.id, e.clientX, e.clientY); }}
                    className="nodrag grid h-4 w-4 place-items-center rounded-full text-white hover:scale-110"
                    style={{ background: meta.color }}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                <Handle type="source" position={Position.Right} id={h.id} className="!h-3 !w-3 !border-2 !border-white" style={{ background: meta.color, top: "50%", right: -7 }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function outcomeHandle(outcome: string, d: FlowNodeData) {
  if (d.kind === "condition") return outcome === "yes" ? "yes" : outcome === "no" ? "no" : "";
  if (d.kind === "waitReply") {
    if (outcome.startsWith("option: ")) {
      const i = d.options.indexOf(outcome.slice(8).replace(/ \(no branch.*$/, ""));
      return i >= 0 ? `opt:${i}` : "";
    }
    if (outcome.startsWith("replied (other)")) return "any";
    if (outcome.startsWith("no reply")) return "timeout";
  }
  return "";
}

const nodeTypes = { flow: FlowNodeCard };

const toRF = (g: FlowGraph): { nodes: Node<FlowNodeData>[]; edges: Edge[] } => ({
  nodes: g.nodes.map((n) => ({ id: n.id, type: "flow", position: n.position, data: n.data, deletable: n.data.kind !== "trigger" })),
  edges: g.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: "in" })),
});
const fromRF = (nodes: Node<FlowNodeData>[], edges: Edge[]): FlowGraph => ({
  nodes: nodes.map((n) => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? "next", target: e.target })),
});

type EditorProps = { init: FlowInit; canEdit: boolean; connected: boolean; rules: RuleRef[]; otherFlows: FlowRef[] };

export function FlowEditor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ init, canEdit, connected: waConnected, rules, otherFlows }: EditorProps) {
  const toast = useToast();
  const rf = useReactFlow();
  const initial = useMemo(() => toRF(init.graph), [init.graph]);
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [name, setName] = useState(init.name);
  const [active, setActive] = useState(init.active);
  const [settings, setSettings] = useState<FlowSettings>({ ...DEFAULT_SETTINGS, ...init.settings });
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [panel, setPanel] = useState<null | "settings" | "runs" | "test" | "checks">(null);
  const [ruleList, setRuleList] = useState(rules);
  const [adder, setAdder] = useState<{ nodeId: string; handle: string; x: number; y: number } | null>(null);

  const loadStats = useCallback(() => api<Stats>(`/api/flows/${init.id}/stats`).then(setStats).catch(() => {}), [init.id]);
  useEffect(() => {
    api<Template[]>("/api/templates").then(setTemplates).catch(() => {});
    loadStats();
    // Keep the counts on the map and the Runs panel fresh while the page is open.
    const t = setInterval(() => { if (document.visibilityState === "visible") loadStats(); }, 30_000);
    return () => clearInterval(t);
  }, [loadStats]);

  const graph = useMemo(() => fromRF(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validateFlow(graph), [graph]);
  const connected = useMemo(() => new Set(edges.map((e) => `${e.source}:${e.sourceHandle}`)), [edges]);
  const warnings = useMemo(() => flowWarnings(graph, templates), [graph, templates]);
  const warned = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const w of warnings) if (w.nodeId) m.set(w.nodeId, [...(m.get(w.nodeId) ?? []), w.text]);
    return m;
  }, [warnings]);
  const trig = nodes.find((n) => n.data.kind === "trigger")?.data as Extract<FlowNodeData, { kind: "trigger" }> | undefined;
  const overlapRules = useMemo(() => (trig ? ruleList.filter((r) => overlappingRuleTriggers(trig.trigger).includes(r.trigger)) : []), [trig, ruleList]);
  const overlapFlows = useMemo(() => {
    if (!trig || trig.trigger === "MANUAL") return [];
    const kws = trig.keywords.map((k) => k.toLowerCase());
    return otherFlows.filter((f) => f.trigger === trig.trigger && (trig.trigger !== "KEYWORD" || f.keywords.some((k) => kws.includes(k.toLowerCase()))));
  }, [trig, otherFlows]);
  const checkCount = issues.length + warnings.length + overlapRules.length + overlapFlows.length;

  const mark = () => setDirty(true);
  const onNodesChange = useCallback((c: NodeChange<Node<FlowNodeData>>[]) => {
    setNodes((n) => applyNodeChanges(c, n));
    if (c.some((x) => x.type !== "select" && x.type !== "dimensions")) mark();
  }, []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => {
    setEdges((e) => applyEdgeChanges(c, e));
    if (c.some((x) => x.type !== "select")) mark();
  }, []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    // One link per output: reconnecting an output replaces its old link.
    setEdges((es) => [...es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)), { id: `e-${c.source}-${c.sourceHandle}-${c.target}-${Date.now()}`, source: c.source!, sourceHandle: c.sourceHandle ?? "next", target: c.target!, targetHandle: "in" }]);
    mark();
  }, []);

  const relayout = useCallback((ns = nodes, es = edges) => {
    const g = autoLayout(fromRF(ns, es));
    const pos = new Map(g.nodes.map((n) => [n.id, n.position]));
    setNodes(ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 30);
    mark();
  }, [nodes, edges, rf]);

  const addChild = (kind: NodeKind) => {
    if (!adder) return;
    const id = `${kind[0]}${Date.now().toString(36)}`;
    const parent = nodes.find((n) => n.id === adder.nodeId);
    const data = defaultData(kind);
    // A reply-wait after a message with buttons inherits those buttons as its options.
    if (kind === "waitReply" && parent?.data.kind === "message" && parent.data.buttons.length) (data as Extract<FlowNodeData, { kind: "waitReply" }>).options = [...parent.data.buttons];
    const nn: Node<FlowNodeData> = { id, type: "flow", position: { x: (parent?.position.x ?? 0) + 300, y: parent?.position.y ?? 0 }, data, deletable: true };
    const ne: Edge = { id: `e-${adder.nodeId}-${adder.handle}-${id}`, source: adder.nodeId, sourceHandle: adder.handle, target: id, targetHandle: "in" };
    const ns = [...nodes, nn], es = [...edges, ne];
    setEdges(es);
    relayout(ns, es);
    setSelected(id);
    setAdder(null);
  };

  const updateData = (id: string, d: FlowNodeData) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: d } : n)));
    // Removing options/buttons can orphan edges from handles that no longer exist.
    setEdges((es) => es.filter((e) => e.source !== id || outputHandles(d).some((h) => h.id === e.sourceHandle)));
    mark();
  };
  const removeOption = (id: string, index: number) => {
    setNodes((ns) => ns.map((n) => (n.id === id && n.data.kind === "waitReply" ? { ...n, data: { ...n.data, options: n.data.options.filter((_, j) => j !== index) } } : n)));
    // Later options move up one slot; their branches move with them.
    setEdges((es) => removeReplyOption(es, id, index));
    mark();
  };
  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelected(null);
    mark();
  };

  const save = useCallback(async (patch: { active?: boolean } = {}) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const r = await api<{ removedRuns?: number }>(`/api/flows/${init.id}`, { method: "PATCH", body: { name, graph, settings, ...patch } });
      setDirty(false);
      const removed = r?.removedRuns ? `${r.removedRuns} lead${r.removedRuns === 1 ? " was" : "s were"} on a step you deleted, so they left the flow.` : undefined;
      if (patch.active !== undefined) {
        setActive(patch.active);
        if (patch.active)
          toast.success("Flow is live", removed ?? (waConnected ? "Matching leads will now get this journey on WhatsApp." : "Simulation mode: messages are logged in the WhatsApp inbox, not really sent."));
        else toast.success("Flow paused", removed ?? "No new leads will enter. Leads already inside stay where they are until you go live again.");
      } else toast.success("Flow saved", removed ?? (active ? "Changes apply to leads straight away." : undefined));
      loadStats();
      return true;
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [canEdit, init.id, name, graph, settings, toast, waConnected, active, loadStats]);

  /** Go live: blocking problems first, then (on live WhatsApp) a last look at delivery warnings. */
  const goLive = async (confirmed = false) => {
    if (issues.length) {
      setPanel("checks");
      return toast.error("Fix this before going live", issues[0]);
    }
    if (waConnected && !confirmed && checkCount > 0) return setPanel("checks");
    if ((await save({ active: true })) && checkCount > 0 && !waConnected) setPanel("checks");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    };
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", warn); };
  }, [save, dirty]);

  const sel = nodes.find((n) => n.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
        <Link href="/nurture" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Back"><ArrowLeft className="h-4 w-4" /></Link>
        <input value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); mark(); }} className="min-w-0 max-w-[320px] rounded px-1 text-base font-semibold text-teal-700 hover:bg-slate-50 focus:outline-none" />
        <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>{active ? "● Live" : "Draft"}</span>
        {issues.length > 0 && <span className="hidden truncate text-xs text-amber-700 md:inline" title={issues.join("\n")}>⚠ {issues[0]}{issues.length > 1 ? ` (+${issues.length - 1})` : ""}</span>}
        {dirty && <span className="text-xs text-slate-400">Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <HeaderBtn onClick={() => relayout()} title="Arrange as mind map"><Wand2 className="h-4 w-4" /> Arrange</HeaderBtn>
          <HeaderBtn active={showStats} onClick={() => setShowStats(!showStats)} title="Show counts on steps"><BarChart3 className="h-4 w-4" /> Stats</HeaderBtn>
          <HeaderBtn active={panel === "runs"} onClick={() => setPanel(panel === "runs" ? null : "runs")} title="Leads in this flow">Runs {stats ? `(${stats.totals.total ?? 0})` : ""}</HeaderBtn>
          {canEdit && <HeaderBtn active={panel === "test"} onClick={() => setPanel(panel === "test" ? null : "test")} title="Add leads to this flow"><UserPlus className="h-4 w-4" /> Add leads</HeaderBtn>}
          <HeaderBtn active={panel === "checks"} onClick={() => setPanel(panel === "checks" ? null : "checks")} title="Things to check before going live">
            <AlertTriangle className={clsx("h-4 w-4", checkCount ? "text-amber-600" : "")} /> Checks{checkCount ? ` (${checkCount})` : ""}
          </HeaderBtn>
          <HeaderBtn active={panel === "settings"} onClick={() => setPanel(panel === "settings" ? null : "settings")} title="Flow settings"><Settings2 className="h-4 w-4" /></HeaderBtn>
          {canEdit && (
            <>
              <button onClick={() => save()} disabled={saving} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4 text-amber-600" /> : <Check className="h-4 w-4 text-teal-600" />} Save
              </button>
              <button onClick={() => (active ? save({ active: false }) : goLive())} disabled={saving} className={clsx("h-8 rounded-lg px-3 text-sm font-semibold text-white", active ? "bg-slate-600 hover:bg-slate-700" : "bg-teal-600 hover:bg-teal-700")}>
                {active ? "Pause" : "Go live"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Ctx.Provider value={{ templates, stats: showStats ? stats?.nodes ?? null : null, connected, warned, onAdd: (nodeId, handle, x, y) => canEdit && setAdder({ nodeId, handle, x, y }) }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={canEdit ? onNodesChange : undefined}
              onEdgesChange={canEdit ? onEdgesChange : undefined}
              onConnect={canEdit ? onConnect : undefined}
              onNodeClick={(_, n) => setSelected(n.id)}
              onPaneClick={() => { setSelected(null); setAdder(null); }}
              fitView
              fitViewOptions={{ padding: 0.15, minZoom: 0.6, maxZoom: 1 }}
              minZoom={0.2}
              defaultEdgeOptions={{ type: "default", style: { strokeWidth: 2, stroke: "#94a3b8" } }}
              deleteKeyCode={canEdit ? ["Delete"] : null}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} color="#cbd5e1" />
              <Controls position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => NODE_META[(n.data as FlowNodeData).kind]?.color ?? "#94a3b8"} />
            </ReactFlow>
          </Ctx.Provider>
          {adder && (
            <div className="fixed z-[60] w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl" style={{ left: Math.min(adder.x + 8, window.innerWidth - 240), top: Math.min(adder.y - 10, window.innerHeight - 330) }}>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase text-slate-400">Add next step</div>
              {(["message", "wait", "waitReply", "condition", "action", "end"] as NodeKind[]).map((k) => {
                const Icon = ICONS[k];
                return (
                  <button key={k} onClick={() => addChild(k)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: NODE_META[k].color }}><Icon className="h-3.5 w-3.5" /></span>
                    <span><span className="block text-sm font-medium">{NODE_META[k].label}</span><span className="block text-[11px] leading-tight text-slate-500">{NODE_META[k].hint}</span></span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-slate-500 shadow">
            Click <b>+</b> on a branch to grow the map · drag a dot to connect · click a step to edit
          </div>
        </div>

        {(sel || panel) && (
          <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
            {panel === "settings" ? (
              <SettingsPanel settings={settings} canEdit={canEdit} onChange={(s) => { setSettings(s); mark(); }} onClose={() => setPanel(null)} />
            ) : panel === "runs" ? (
              <RunsPanel stats={stats} nodes={nodes} onClose={() => setPanel(null)} onRefresh={loadStats} />
            ) : panel === "test" ? (
              <EnrollPanel flowId={init.id} dirty={dirty} active={active} onClose={() => setPanel(null)} onDone={loadStats} />
            ) : panel === "checks" ? (
              <ChecksPanel
                issues={issues} warnings={warnings} rules={overlapRules} flows={overlapFlows} waConnected={waConnected} canEdit={canEdit} active={active} saving={saving}
                onShow={(id) => { setPanel(null); setSelected(id); }}
                onPauseRule={async (r) => {
                  try {
                    await api(`/api/automations/${r.id}`, { method: "PATCH", body: { active: false } });
                    setRuleList((l) => l.filter((x) => x.id !== r.id));
                    toast.success("Automation paused", `"${r.name}" is off. Turn it back on any time from Automations.`);
                  } catch (e) {
                    toast.error("Couldn't pause it", (e as Error).message);
                  }
                }}
                onGoLive={() => goLive(true)}
                onClose={() => setPanel(null)}
              />
            ) : sel ? (
              <NodePanel key={sel.id} node={sel} templates={templates} canEdit={canEdit} warnings={warned.get(sel.id) ?? []} hasAny={connected.has(`${sel.id}:any`)} onChange={(d) => updateData(sel.id, d)} onRemoveOption={(i) => removeOption(sel.id, i)} onDelete={() => deleteNode(sel.id)} onClose={() => setSelected(null)} />
            ) : null}
          </aside>
        )}
      </div>
    </div>
  );
}

function HeaderBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return <button onClick={onClick} title={title} className={clsx("flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm", active ? "bg-teal-50 font-semibold text-teal-700" : "text-slate-600 hover:bg-slate-100")}>{children}</button>;
}

function PanelHead({ title, color, onClose }: { title: string; color?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
      <h3 className="flex items-center gap-2 font-semibold">{color && <span className="h-3 w-3 rounded-full" style={{ background: color }} />}{title}</h3>
      <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-teal-500 focus:outline-none disabled:bg-slate-50";

function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const unit = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
  return (
    <div className="flex gap-2">
      <input type="number" min={1} value={minutes / unit} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1) * unit)} className={inputCls} />
      <select value={unit} onChange={(e) => onChange(Math.max(1, Math.round(minutes / unit)) * Number(e.target.value))} className={inputCls}>
        <option value={1}>minutes</option><option value={60}>hours</option><option value={1440}>days</option>
      </select>
    </div>
  );
}

function ConditionsEditor({ conds, onChange }: { conds: Condition[]; onChange: (c: Condition[]) => void }) {
  return (
    <div className="space-y-2">
      {conds.map((c, i) => {
        const f = CONDITION_FIELDS[c.field];
        return (
          <div key={i} className="flex gap-1.5">
            <select value={c.field} onChange={(e) => onChange(conds.map((x, j) => (j === i ? { ...x, field: e.target.value as Condition["field"], value: "" } : x)))} className={inputCls}>
              {Object.entries(CONDITION_FIELDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={c.op} onChange={(e) => onChange(conds.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition["op"] } : x)))} className="w-16 rounded-lg border border-slate-200 px-1 text-sm">
              <option value="eq">=</option><option value="neq">≠</option>{!f?.options && <><option value="gte">≥</option><option value="lte">≤</option></>}
            </select>
            {f?.options ? (
              <select value={String(c.value)} onChange={(e) => onChange(conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={inputCls}>
                <option value="">Select…</option>{f.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ").toLowerCase()}</option>)}
              </select>
            ) : (
              <input type="number" value={String(c.value)} onChange={(e) => onChange(conds.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)))} className={inputCls} />
            )}
            <button onClick={() => onChange(conds.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
      <button onClick={() => onChange([...conds, { field: "temperature", op: "eq", value: "HOT" }])} className="text-xs font-medium text-teal-700 hover:underline">+ Add condition</button>
    </div>
  );
}

function NodePanel({ node, templates, canEdit, warnings, hasAny, onChange, onRemoveOption, onDelete, onClose }: { node: Node<FlowNodeData>; templates: Template[]; canEdit: boolean; warnings: string[]; hasAny: boolean; onChange: (d: FlowNodeData) => void; onRemoveOption: (i: number) => void; onDelete: () => void; onClose: () => void }) {
  const d = node.data;
  const meta = NODE_META[d.kind];
  return (
    <div>
      <PanelHead title={meta.label} color={meta.color} onClose={onClose} />
      <fieldset disabled={!canEdit} className="space-y-4 p-4 text-sm">
        {warnings.map((w) => <p key={w} className="flex gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>)}
        {d.kind === "trigger" && (
          <>
            <label className="block">Start this flow when
              <select value={d.trigger} onChange={(e) => onChange({ ...d, trigger: e.target.value as typeof d.trigger })} className={`${inputCls} mt-1`}>
                {Object.entries(FLOW_TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {d.trigger === "KEYWORD" && (
              <label className="block">Keywords (comma separated)
                <input value={d.keywords.join(", ")} onChange={(e) => onChange({ ...d, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} className={`${inputCls} mt-1`} placeholder="hi, menu, price" />
                <span className="mt-1 block text-xs text-slate-500">Matches whole words, any case. A keyword bot answers every time it's asked.</span>
              </label>
            )}
            {d.trigger === "MANUAL" && <p className="text-xs text-slate-500">Leads enter only when you add them (Add leads) or from a Broadcast.</p>}
            <div><div className="mb-1">Only if the lead matches</div><ConditionsEditor conds={d.conditions} onChange={(c) => onChange({ ...d, conditions: c })} /></div>
          </>
        )}
        {d.kind === "message" && (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
              <button type="button" onClick={() => onChange({ ...d, templateKey: null })} className={clsx("rounded-md py-1.5", !d.templateKey ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>Write message</button>
              <button type="button" onClick={() => onChange({ ...d, templateKey: (templates.find((t) => t.active && t.metaTemplateName) ?? templates.find((t) => t.active))?.key ?? null })} className={clsx("rounded-md py-1.5", d.templateKey ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>Use template</button>
            </div>
            {d.templateKey !== null ? (
              <label className="block">Template
                <select value={d.templateKey} onChange={(e) => onChange({ ...d, templateKey: e.target.value })} className={`${inputCls} mt-1`}>
                  {templates.filter((t) => t.active).map((t) => <option key={t.key} value={t.key}>{t.name}{t.metaTemplateName ? " ✓ Meta approved" : ""}</option>)}
                </select>
                <span className="mt-1 block text-xs text-slate-500">Meta-approved templates can be sent anytime. Others only within 24 h of the customer&apos;s last message. Manage templates in <Link href="/settings?tab=templates" className="text-teal-700 underline">Settings, WhatsApp templates</Link>.</span>
              </label>
            ) : (
              <label className="block">Message
                <textarea rows={6} value={d.body} onChange={(e) => onChange({ ...d, body: e.target.value })} className={`${inputCls} mt-1`} />
                <div className="mt-1 flex flex-wrap gap-1">
                  {VAR_CHIPS.map((v) => <button type="button" key={v} onClick={() => onChange({ ...d, body: `${d.body}{{${v}}}` })} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-teal-50">{`{{${v}}}`}</button>)}
                </div>
                <span className="mt-1 block text-xs text-slate-500">Free text reaches the customer only within 24 h of their last message. To message a new or silent lead, use a Meta-approved template.</span>
              </label>
            )}
            <div>
              <div className="mb-1">Quick-reply buttons <span className="text-xs text-slate-400">(up to 3, 20 chars)</span></div>
              {d.buttons.map((b, i) => (
                <div key={i} className="mb-1.5 flex gap-1.5">
                  <input maxLength={20} value={b} onChange={(e) => onChange({ ...d, buttons: d.buttons.map((x, j) => (j === i ? e.target.value : x)) })} className={inputCls} />
                  <button type="button" onClick={() => onChange({ ...d, buttons: d.buttons.filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {d.buttons.length < 3 && <button type="button" onClick={() => onChange({ ...d, buttons: [...d.buttons, ""] })} className="text-xs font-medium text-teal-700 hover:underline">+ Add button</button>}
              {d.buttons.length > 0 && <p className="mt-1 text-xs text-slate-500">Follow this with a <b>Wait for reply</b> step to branch on the button tapped.</p>}
            </div>
            <WhatsAppPreview text={render(d.templateKey ? templates.find((t) => t.key === d.templateKey)?.body ?? "" : d.body)} buttons={d.buttons} />
          </>
        )}
        {d.kind === "wait" && (<label className="block">Wait for<div className="mt-1"><DurationInput minutes={d.minutes} onChange={(m) => onChange({ ...d, minutes: m })} /></div><span className="mt-1 block text-xs text-slate-500">Messages that fall in quiet hours are held until morning.</span></label>)}
        {d.kind === "waitReply" && (
          <>
            <div>
              <div className="mb-1">Reply options <span className="text-xs text-slate-400">(each gets its own branch)</span></div>
              {d.options.map((o, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-1.5">
                  <span className="w-5 text-xs text-slate-400">{i + 1}.</span>
                  <input value={o} onChange={(e) => onChange({ ...d, options: d.options.map((x, j) => (j === i ? e.target.value : x)) })} className={inputCls} />
                  <button type="button" onClick={() => onRemoveOption(i)} className="text-slate-400 hover:text-red-600" title="Remove option and its branch"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {d.options.length < 10 && <button type="button" onClick={() => onChange({ ...d, options: [...d.options, ""] })} className="text-xs font-medium text-teal-700 hover:underline">+ Add option</button>}
              <p className="mt-1 text-xs text-slate-500">Matches the button tapped, the option text, or its number (&quot;1&quot;, &quot;2&quot;…). Anything else goes to <b>Any other reply</b>.</p>
              {!hasAny && <p className="mt-1 text-xs text-slate-500">Nothing is connected to <b>Any other reply</b>, so an unexpected answer stops the flow and the salesperson is notified to reply personally.</p>}
            </div>
            <label className="block">If no reply within<div className="mt-1"><DurationInput minutes={d.timeoutMinutes} onChange={(m) => onChange({ ...d, timeoutMinutes: m })} /></div></label>
          </>
        )}
        {d.kind === "condition" && (<div><div className="mb-1">Go down <b>Yes</b> when all of these are true</div><ConditionsEditor conds={d.conditions} onChange={(c) => onChange({ ...d, conditions: c })} /></div>)}
        {d.kind === "action" && <ActionEditor action={d.action} onChange={(a) => onChange({ ...d, action: a })} />}
        {d.kind === "end" && <p className="text-slate-500">The lead leaves the flow here.</p>}
        {d.kind !== "trigger" && (
          <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete step</button>
        )}
      </fieldset>
    </div>
  );
}

function ActionEditor({ action, onChange }: { action: FlowAction; onChange: (a: FlowAction) => void }) {
  const setType = (type: FlowAction["type"]) => {
    const defaults: Record<FlowAction["type"], FlowAction> = {
      CREATE_TASK: { type: "CREATE_TASK", title: "Call this lead", dueInHours: 4, priority: "NORMAL" },
      NOTIFY_ASSIGNEE: { type: "NOTIFY_ASSIGNEE", title: "Lead needs attention" },
      NOTIFY_MANAGERS: { type: "NOTIFY_MANAGERS", title: "Lead needs attention" },
      SET_FOLLOW_UP: { type: "SET_FOLLOW_UP", inHours: 24 },
      SET_TEMPERATURE: { type: "SET_TEMPERATURE", value: "HOT" },
      SET_STAGE: { type: "SET_STAGE", value: "CONTACTED" },
    };
    onChange(defaults[type]);
  };
  return (
    <div className="space-y-3">
      <label className="block">Do this
        <select value={action.type} onChange={(e) => setType(e.target.value as FlowAction["type"])} className={`${inputCls} mt-1`}>
          {Object.entries(ACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {"title" in action && <label className="block">{action.type === "CREATE_TASK" ? "Task" : "Message"}<input value={action.title} onChange={(e) => onChange({ ...action, title: e.target.value })} className={`${inputCls} mt-1`} /></label>}
      {action.type === "CREATE_TASK" && (
        <div className="flex gap-2">
          <label className="block flex-1">Due in (hours)<input type="number" min={0} value={action.dueInHours} onChange={(e) => onChange({ ...action, dueInHours: Number(e.target.value) })} className={`${inputCls} mt-1`} /></label>
          <label className="block flex-1">Priority<select value={action.priority ?? "NORMAL"} onChange={(e) => onChange({ ...action, priority: e.target.value as "LOW" })} className={`${inputCls} mt-1`}><option>LOW</option><option>NORMAL</option><option>HIGH</option></select></label>
        </div>
      )}
      {action.type === "SET_FOLLOW_UP" && <label className="block">In (hours)<input type="number" min={1} value={action.inHours} onChange={(e) => onChange({ ...action, inHours: Number(e.target.value) })} className={`${inputCls} mt-1`} /></label>}
      {action.type === "SET_TEMPERATURE" && <label className="block">Temperature<select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value as "HOT" })} className={`${inputCls} mt-1`}><option>HOT</option><option>WARM</option><option>COLD</option></select></label>}
      {action.type === "SET_STAGE" && (
        <label className="block">Stage<select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })} className={`${inputCls} mt-1`}>{CONDITION_FIELDS.stage.options.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select></label>
      )}
    </div>
  );
}

function WhatsAppPreview({ text, buttons }: { text: string; buttons: string[] }) {
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-3">
      <div className="max-w-[260px] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 text-[12.5px] leading-snug text-slate-800 shadow-sm">
        <div className="whitespace-pre-wrap">{text || <span className="text-slate-400">Message preview</span>}</div>
        <div className="mt-0.5 text-right text-[10px] text-slate-400">10:30 AM</div>
      </div>
      {buttons.filter(Boolean).map((b) => <div key={b} className="mt-1 max-w-[260px] rounded-lg bg-white py-1.5 text-center text-[12.5px] font-medium text-sky-600 shadow-sm">↩ {b}</div>)}
    </div>
  );
}

const STAGES = ["WON", "LOST", "DISQUALIFIED", "NEGOTIATION", "QUOTATION_SENT", "SITE_VISIT_SCHEDULED"];

function SettingsPanel({ settings, canEdit, onChange, onClose }: { settings: FlowSettings; canEdit: boolean; onChange: (s: FlowSettings) => void; onClose: () => void }) {
  return (
    <div>
      <PanelHead title="Flow settings" onClose={onClose} />
      <fieldset disabled={!canEdit} className="space-y-4 p-4 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" checked={settings.stopOnReply} onChange={(e) => onChange({ ...settings, stopOnReply: e.target.checked })} className="mt-1" />
          <span>Hand over to sales when the customer replies<span className="block text-xs text-slate-500">Stops the flow and notifies the salesperson. Wait-for-reply steps branch instead.</span></span>
        </label>
        <div>Stop when the lead reaches
          <div className="mt-1 flex flex-wrap gap-1.5">
            {STAGES.map((s) => {
              const on = settings.stopStages.includes(s);
              return <button type="button" key={s} onClick={() => onChange({ ...settings, stopStages: on ? settings.stopStages.filter((x) => x !== s) : [...settings.stopStages, s] })} className={clsx("rounded-full border px-2 py-0.5 text-xs", on ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500")}>{s.replace(/_/g, " ").toLowerCase()}</button>;
            })}
          </div>
        </div>
        <div>Quiet hours (IST) <span className="text-xs text-slate-400">· automated sends wait until morning</span>
          <div className="mt-1 flex items-center gap-2">
            <select value={settings.quietStart} onChange={(e) => onChange({ ...settings, quietStart: Number(e.target.value) })} className={inputCls}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
            to
            <select value={settings.quietEnd} onChange={(e) => onChange({ ...settings, quietEnd: Number(e.target.value) })} className={inputCls}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
          </div>
          <span className="mt-1 block text-xs text-slate-500">Replies to a customer who just messaged are always sent immediately.</span>
        </div>
        <label className="flex items-start gap-2"><input type="checkbox" checked={settings.reentry} onChange={(e) => onChange({ ...settings, reentry: e.target.checked })} className="mt-1" />
          <span>Allow a lead to go through this flow again<span className="block text-xs text-slate-500">Off = each lead gets this journey once.</span></span>
        </label>
      </fieldset>
    </div>
  );
}

function ChecksPanel(p: {
  issues: string[]; warnings: FlowWarning[]; rules: RuleRef[]; flows: FlowRef[]; waConnected: boolean; canEdit: boolean; active: boolean; saving: boolean;
  onShow: (nodeId: string) => void; onPauseRule: (r: RuleRef) => void; onGoLive: () => void; onClose: () => void;
}) {
  const nothing = !p.issues.length && !p.warnings.length && !p.rules.length && !p.flows.length;
  return (
    <div>
      <PanelHead title="Checks before going live" onClose={p.onClose} />
      <div className="space-y-5 p-4 text-sm">
        {nothing && <p className="rounded-lg bg-green-50 px-3 py-2 text-green-800">All good. Nothing to fix.</p>}
        {p.issues.length > 0 && (
          <section>
            <h4 className="mb-1.5 font-semibold text-red-700">Fix before going live</h4>
            <ul className="space-y-1.5">{p.issues.map((i) => <li key={i} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{i}</li>)}</ul>
          </section>
        )}
        {p.warnings.length > 0 && (
          <section>
            <h4 className="mb-1 font-semibold text-amber-800">WhatsApp delivery</h4>
            <p className="mb-2 text-xs text-slate-500">
              {p.waConnected
                ? "WhatsApp is connected, so these steps can fail for real customers until fixed."
                : "You're in simulation mode, so nothing is really sent yet and the flow works for testing. Fix these before you connect WhatsApp Cloud."}
            </p>
            <ul className="space-y-1.5">
              {p.warnings.map((w, i) => (
                <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {w.text}
                  {w.nodeId && <button onClick={() => p.onShow(w.nodeId!)} className="ml-1 font-semibold text-teal-700 hover:underline">Show step</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {p.rules.length > 0 && (
          <section>
            <h4 className="mb-1 font-semibold text-slate-800">Automations that also message these leads</h4>
            <ul className="space-y-2">
              {p.rules.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="text-slate-500">{TRIGGERS[r.trigger as keyof typeof TRIGGERS]?.label ?? r.trigger}</div>
                  <p className="mt-1 text-slate-600">
                    {FLOW_OWNED_TRIGGERS.includes(r.trigger)
                      ? "No double messages: its WhatsApp message is skipped for leads this flow has just messaged. Its other actions, like call tasks, still run."
                      : "This one is always sent (it carries details like a quotation link or visit time), so leads may get both messages."}
                  </p>
                  {p.canEdit && <button onClick={() => p.onPauseRule(r)} className="mt-1.5 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50">Pause this automation</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {p.flows.length > 0 && (
          <section>
            <h4 className="mb-1 font-semibold text-slate-800">Other live flows with the same start</h4>
            <p className="mb-1.5 text-xs text-slate-500">A lead who matches both will get both journeys. Add a condition on the Start step, or pause one of them.</p>
            <ul className="space-y-1">{p.flows.map((f) => <li key={f.id}><Link href={`/nurture/flows/${f.id}`} className="text-xs font-medium text-teal-700 hover:underline">{f.name}</Link></li>)}</ul>
          </section>
        )}
        {p.canEdit && !p.active && (
          <button onClick={p.onGoLive} disabled={p.saving || p.issues.length > 0} className="w-full rounded-lg bg-teal-600 py-2 font-semibold text-white hover:bg-teal-700 disabled:opacity-40">
            {nothing ? "Go live" : "Go live anyway"}
          </button>
        )}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = { ACTIVE: "bg-sky-100 text-sky-700", WAITING_REPLY: "bg-violet-100 text-violet-700", COMPLETED: "bg-green-100 text-green-700", STOPPED: "bg-amber-100 text-amber-700", FAILED: "bg-red-100 text-red-700" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "in flow", WAITING_REPLY: "waiting for reply", COMPLETED: "completed", STOPPED: "stopped", FAILED: "failed" };

function RunsPanel({ stats, nodes, onClose, onRefresh }: { stats: Stats | null; nodes: Node<FlowNodeData>[]; onClose: () => void; onRefresh: () => void }) {
  const t = stats?.totals ?? {};
  return (
    <div>
      <PanelHead title="Leads in this flow" onClose={onClose} />
      <div className="grid grid-cols-3 gap-2 p-4 text-center text-xs">
        {[["In flow", (t.ACTIVE ?? 0) + (t.WAITING_REPLY ?? 0)], ["Replied", t.replied ?? 0], ["Completed", t.COMPLETED ?? 0], ["Handed over", t.STOPPED ?? 0], ["Failed", t.FAILED ?? 0], ["Total", t.total ?? 0]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">{l}</div><div className="text-lg font-bold text-slate-800">{v}</div></div>
        ))}
      </div>
      <div className="flex justify-end px-4"><button onClick={onRefresh} className="text-xs text-teal-700 hover:underline">Refresh</button></div>
      <ul className="divide-y divide-slate-100 px-2 pb-4 text-sm">
        {stats?.runs.map((r) => {
          const at = nodes.find((n) => n.id === r.currentNodeId);
          return (
            <li key={r.id} className="px-2 py-2">
              <div className="flex items-center gap-2">
                <Link href={`/leads/${r.lead.id}`} className="font-medium text-teal-700 hover:underline">{r.lead.name}</Link>
                <span className={clsx("ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold", STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status] ?? r.status.toLowerCase()}</span>
              </div>
              <div className="text-xs text-slate-500">
                {at ? `At: ${NODE_META[at.data.kind].label}` : r.stopReason ?? ""}
                {r.nextRunAt && (r.status === "ACTIVE" || r.status === "WAITING_REPLY") ? ` · next ${new Date(r.nextRunAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}` : ""}
              </div>
            </li>
          );
        })}
        {!stats?.runs.length && <li className="px-2 py-6 text-center text-xs text-slate-500">No leads have entered this flow yet.</li>}
      </ul>
    </div>
  );
}

function EnrollPanel({ flowId, dirty, active, onClose, onDone }: { flowId: string; dirty: boolean; active: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; code: string; phone: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ items: { id: string; name: string; code: string; phone: string }[] }>(`/api/leads?pageSize=20&q=${encodeURIComponent(q)}`).then((r) => setItems(r.items ?? [])).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const enroll = async () => {
    try {
      const r = await api<{ started: number; skipped: number }>(`/api/flows/${flowId}/enroll`, { body: { leadIds: [...picked] } });
      toast.success(`${r.started} lead${r.started === 1 ? "" : "s"} added`, r.skipped ? `${r.skipped} skipped: already in this flow, or replied STOP` : "Open Runs to follow them.");
      setPicked(new Set());
      onDone();
    } catch (e) {
      toast.error("Couldn't add leads", (e as Error).message);
    }
  };
  return (
    <div>
      <PanelHead title="Add leads to this flow" onClose={onClose} />
      <div className="space-y-3 p-4 text-sm">
        {dirty && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Save first. Leads run the last saved version.</p>}
        {!active && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">This flow is a draft. Leads you add here still go through it, which is handy for testing. Leads who replied STOP are skipped.</p>}
        <p className="text-xs text-slate-500">Tip: add yourself as a lead to test the journey on your own WhatsApp.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, code…" className={inputCls} />
        <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
          {items.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                <input type="checkbox" checked={picked.has(l.id)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(l.id); else s.delete(l.id); setPicked(s); }} />
                <span className="flex-1">{l.name}<span className="block text-xs text-slate-400">{l.code}</span></span>
              </label>
            </li>
          ))}
        </ul>
        <button onClick={enroll} disabled={!picked.size || dirty} className="w-full rounded-lg bg-teal-600 py-2 font-semibold text-white disabled:opacity-40">Start flow for {picked.size || ""} lead{picked.size === 1 ? "" : "s"}</button>
      </div>
    </div>
  );
}
