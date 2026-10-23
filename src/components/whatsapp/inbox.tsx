"use client";

import { TimeAgo } from "../time-ago";
import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Search, MessageCircle, ArrowLeft } from "lucide-react";
import { Card, EmptyState } from "../ui";
import { TemperatureBadge } from "../badges";
import { WhatsAppThread } from "./thread";
import { displayPhone } from "@/lib/text";

export interface Conversation {
  leadId: string;
  body: string;
  direction: string;
  createdAt: string;
  unread: number;
  lead: { id: string; name: string; code: string; phone: string; temperature: string };
}

export function Inbox({ conversations, templates, initialLead, connected }: { conversations: Conversation[]; templates: { key: string; name: string }[]; initialLead?: string; connected: boolean }) {
  const [active, setActive] = useState<string | null>(initialLead ?? null);
  const [q, setQ] = useState("");
  const list = conversations.filter((c) => !q || c.lead.name.toLowerCase().includes(q.toLowerCase()) || c.lead.phone.includes(q.replace(/\D/g, "")));
  const current = conversations.find((c) => c.leadId === active);

  return (
    <Card className="grid h-[calc(100vh-190px)] min-h-[520px] overflow-hidden md:grid-cols-[340px_1fr]">
      <div className={clsx("flex min-h-0 flex-col border-r border-slate-100", active && "hidden md:flex")}>
        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!connected && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">Cloud API not connected — messages are logged and opened via wa.me. Connect in Settings → Integrations.</p>}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.length === 0 && <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="No conversations" />}
          {list.map((c) => (
            <li key={c.leadId}>
              <button onClick={() => setActive(c.leadId)} className={clsx("flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", active === c.leadId && "bg-emerald-50/60")}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">{c.lead.name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={clsx("truncate text-sm", c.unread ? "font-bold text-slate-900" : "font-medium text-slate-800")}>{c.lead.name}</span>
                    <TimeAgo date={c.createdAt} strict suffix={false} className="shrink-0 text-[10px] text-slate-400" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={clsx("truncate text-xs", c.unread ? "text-slate-700" : "text-slate-500")}>
                      {c.direction === "OUT" && "You: "}
                      {c.body}
                    </span>
                    {c.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={clsx("flex min-h-0 flex-col", !active && "hidden md:flex")}>
        {current ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
              <button className="md:hidden" onClick={() => setActive(null)} aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <Link href={`/leads/${current.lead.id}`} className="text-sm font-semibold hover:text-sun-700">
                  {current.lead.name}
                </Link>
                <div className="text-xs text-slate-500">
                  {displayPhone(current.lead.phone)} · {current.lead.code}
                </div>
              </div>
              <TemperatureBadge value={current.lead.temperature} />
            </div>
            <div className="min-h-0 flex-1 p-3">
              <WhatsAppThread key={current.leadId} leadId={current.leadId} templates={templates} height="100%" />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="Select a conversation" body="Automated and manual WhatsApp messages with every lead, in one place." />
          </div>
        )}
      </div>
    </Card>
  );
}
