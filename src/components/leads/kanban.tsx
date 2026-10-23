"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Avatar } from "../ui";
import { TemperatureBadge, STAGE_LABEL } from "../badges";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import { formatINRCompact } from "@/lib/text";

export interface KanbanLead {
  id: string;
  name: string;
  code: string;
  stage: string;
  temperature: string;
  score: number;
  recommendedKw: number | null;
  estimatedCost: number | null;
  city: string | null;
  assignedTo: { name: string; avatarColor: string } | null;
}

const COLUMNS = ["NEW", "CONTACTED", "QUALIFIED", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON", "LOST"];
const ACCENT: Record<string, string> = {
  NEW: "bg-slate-400",
  CONTACTED: "bg-blue-500",
  QUALIFIED: "bg-violet-500",
  SITE_VISIT_SCHEDULED: "bg-sky-500",
  SITE_VISIT_DONE: "bg-cyan-500",
  QUOTATION_SENT: "bg-amber-500",
  NEGOTIATION: "bg-orange-500",
  WON: "bg-emerald-500",
  LOST: "bg-rose-500",
};

export function Kanban({ leads: initial, canEdit }: { leads: KanbanLead[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [leads, setLeads] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  async function move(id: string, stage: string) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    let lostReason: string | null = null;
    if (stage === "LOST") {
      lostReason = window.prompt(`Why was ${lead.name} lost?`);
      if (!lostReason) return;
    }
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    try {
      await api(`/api/leads/${id}/actions`, { body: { action: "stage", stage, lostReason } });
      toast.success(`${lead.name} → ${STAGE_LABEL[stage]}`, stage === "WON" ? "Installation project created" : undefined);
      router.refresh();
    } catch (e) {
      setLeads(prev);
      toast.error("Could not move lead", e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max gap-3">
        {COLUMNS.map((col) => {
          const items = leads.filter((l) => l.stage === col);
          const value = items.reduce((a, b) => a + (b.estimatedCost ?? 0), 0);
          const kw = items.reduce((a, b) => a + (b.recommendedKw ?? 0), 0);
          return (
            <div
              key={col}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (drag) move(drag, col);
                setDrag(null);
              }}
              className={clsx("flex w-[272px] shrink-0 flex-col rounded-xl border bg-slate-50/80 transition", over === col ? "border-sun-400 bg-sun-50/60" : "border-slate-200/70")}
            >
              <div className="px-3 pb-2 pt-3">
                <div className="flex items-center gap-2">
                  <span className={clsx("h-2 w-2 rounded-full", ACCENT[col])} />
                  <span className="text-xs font-semibold text-slate-700">{STAGE_LABEL[col]}</span>
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{items.length}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {formatINRCompact(value)} · {kw.toFixed(1)} kW
                </div>
              </div>
              <div className="flex max-h-[calc(100vh-260px)] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable={canEdit}
                    onDragStart={() => setDrag(l.id)}
                    onDragEnd={() => setDrag(null)}
                    className={clsx("rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md", canEdit && "cursor-grab active:cursor-grabbing", drag === l.id && "opacity-40")}
                  >
                    <Link href={`/leads/${l.id}`} className="block text-sm font-medium text-slate-800 hover:text-sun-700">
                      {l.name}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {l.code}
                      {l.city && ` · ${l.city}`}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <TemperatureBadge value={l.temperature} score={l.score} />
                      <div className="text-right text-[11px] font-medium text-slate-600">
                        {l.recommendedKw ? `${l.recommendedKw} kW` : ""}
                        {l.estimatedCost ? <div className="text-slate-400">{formatINRCompact(l.estimatedCost)}</div> : null}
                      </div>
                    </div>
                    {l.assignedTo && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                        <Avatar name={l.assignedTo.name} color={l.assignedTo.avatarColor} size={18} />
                        {l.assignedTo.name}
                      </div>
                    )}
                  </div>
                ))}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-400">Drop leads here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
