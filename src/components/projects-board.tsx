"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import clsx from "clsx";
import { Check, Hammer, IndianRupee } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, Field, ProgressBar } from "./ui";
import { Modal } from "./modal";
import { NumberInput } from "./form-controls";
import { api } from "@/lib/client";
import { useToast } from "./toast";
import { PROJECT_CHECKLIST, PROJECT_STAGES } from "@/lib/defaults";
import { formatINR, formatINRCompact } from "@/lib/text";

export interface ProjectItem {
  id: string;
  code: string;
  stage: string;
  systemKw: number;
  contractValue: number;
  amountReceived: number;
  portalAppId: string | null;
  netMeterNo: string | null;
  installDate: string | null;
  notes: string | null;
  checklist: Record<string, boolean>;
  stageHistory: { stage: string; at: string; by: string }[];
  updatedAt: string;
  lead: { id: string; name: string; phone: string; city: string | null };
  manager: { id: string; name: string; avatarColor: string } | null;
}

const idx = (s: string) => PROJECT_STAGES.findIndex((x) => x.key === s);

export function ProjectsBoard({ projects, users, initialOpen }: { projects: ProjectItem[]; users: { id: string; name: string }[]; initialOpen?: string }) {
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const [filter, setFilter] = useState<"active" | "subsidy" | "closed" | "all">("active");
  const list = projects.filter((p) =>
    filter === "all" ? true : filter === "closed" ? p.stage === "CLOSED" : filter === "subsidy" ? ["COMMISSIONED", "SUBSIDY_APPLIED"].includes(p.stage) : p.stage !== "CLOSED",
  );
  const current = projects.find((p) => p.id === open) ?? null;

  return (
    <>
      <div className="mb-4 flex gap-1">
        {(
          [
            ["active", "Active"],
            ["subsidy", "Awaiting subsidy"],
            ["closed", "Closed"],
            ["all", "All"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={clsx("rounded-lg px-3 py-1.5 text-xs font-medium", filter === k ? "bg-ink-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Hammer className="h-5 w-5" />} title="No projects here" body="Projects open automatically when a lead is marked Won." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((p) => {
            const i = idx(p.stage);
            const pct = Math.round(((i + 1) / PROJECT_STAGES.length) * 100);
            const docs = PROJECT_CHECKLIST.filter((c) => p.checklist[c.key]).length;
            const due = p.contractValue - p.amountReceived;
            return (
              <button key={p.id} onClick={() => setOpen(p.id)} className="card p-4 text-left transition hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-slate-400">{p.code}</div>
                    <div className="truncate font-semibold text-slate-900">{p.lead.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.systemKw} kW · {p.lead.city ?? "—"}
                    </div>
                  </div>
                  {p.manager && <Avatar name={p.manager.name} color={p.manager.avatarColor} size={26} />}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{PROJECT_STAGES[i]?.label}</span>
                  <span className="text-slate-400">
                    Step {i + 1}/{PROJECT_STAGES.length}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar value={pct} tone={p.stage === "CLOSED" || p.stage === "SUBSIDY_RECEIVED" ? "green" : "sun"} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={docs === PROJECT_CHECKLIST.length ? "green" : "slate"}>
                    Docs {docs}/{PROJECT_CHECKLIST.length}
                  </Badge>
                  <Badge tone={due <= 0 ? "green" : "amber"}>{due <= 0 ? "Fully paid" : `${formatINRCompact(due)} due`}</Badge>
                  {p.portalAppId && <Badge tone="blue">Portal ✓</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {current && <ProjectModal p={current} users={users} onClose={() => setOpen(null)} />}
    </>
  );
}

function ProjectModal({ p, users, onClose }: { p: ProjectItem; users: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [checklist, setChecklist] = useState(p.checklist);
  const [amount, setAmount] = useState<number | null>(p.amountReceived);
  const [portal, setPortal] = useState(p.portalAppId ?? "");
  const [meter, setMeter] = useState(p.netMeterNo ?? "");
  const [notes, setNotes] = useState(p.notes ?? "");
  const [manager, setManager] = useState(p.manager?.id ?? "");
  const [busy, setBusy] = useState(false);
  const i = idx(p.stage);

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await api(`/api/projects/${p.id}`, { method: "PATCH", body });
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${p.code} · ${p.lead.name}`}
      subtitle={`${p.systemKw} kW · contract ${formatINR(p.contractValue)}`}
      footer={
        <>
          <Link href={`/leads/${p.lead.id}`} className="mr-auto self-center text-sm font-medium text-sun-700 hover:underline">
            Open lead
          </Link>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => patch({ checklist, amountReceived: amount ?? 0, portalAppId: portal || null, netMeterNo: meter || null, notes: notes || null, managerId: manager || null }, "Project saved")}
          >
            Save details
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Execution stages</h4>
          <ol className="space-y-1">
            {PROJECT_STAGES.map((s, k) => {
              const hist = p.stageHistory.find((h) => h.stage === s.key);
              const done = k <= i;
              return (
                <li key={s.key}>
                  <button
                    disabled={busy || k === i}
                    onClick={() => patch({ stage: s.key }, `Moved to ${s.label}`)}
                    className={clsx("flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50", k === i && "bg-sun-50 ring-1 ring-sun-200")}
                  >
                    <span className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400")}>
                      {done ? <Check className="h-3 w-3" /> : k + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx("block text-sm", done ? "font-medium text-slate-800" : "text-slate-500")}>{s.label}</span>
                      <span className="block text-[11px] text-slate-400">{hist ? `${format(new Date(hist.at), "d MMM yyyy")} · ${hist.by}` : s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] text-slate-400">Click a stage to move the project there. Customers can be notified via a Project-stage automation.</p>
        </div>
        <div className="space-y-5">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents & compliance</h4>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PROJECT_CHECKLIST.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" className="accent-amber-500" checked={!!checklist[c.key]} onChange={(e) => setChecklist((x) => ({ ...x, [c.key]: e.target.checked }))} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount received" hint={`Balance ${formatINR(p.contractValue - (amount ?? 0))}`}>
              <NumberInput prefix="₹" value={amount} onChange={setAmount} />
            </Field>
            <Field label="Project manager">
              <select className="input" value={manager} onChange={(e) => setManager(e.target.value)}>
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PM Surya Ghar application no.">
              <input className="input" value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="NP-TN…" />
            </Field>
            <Field label="Net-meter number">
              <input className="input" value={meter} onChange={(e) => setMeter(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <IndianRupee className="h-3.5 w-3.5" /> Collected {Math.round(((amount ?? 0) / Math.max(1, p.contractValue)) * 100)}% of contract value
          </div>
        </div>
      </div>
    </Modal>
  );
}
