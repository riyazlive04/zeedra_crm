"use client";

import { useState } from "react";
import { format } from "date-fns";
import clsx from "clsx";
import { Radio, ShieldOff, ChevronDown } from "lucide-react";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "../ui";
import { api } from "@/lib/client";

export interface DutySegment {
  onAt: string;
  offAt: string | null;
}
export interface DutySummary {
  userId: string;
  name: string;
  avatarColor: string;
  onDuty: boolean;
  totalOnDutyMs: number;
  segments: DutySegment[];
  permissionDenials: number;
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  if (h === 0 && m === 0) return "0m";
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(" ");
}

const RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

export function DutyHistory({ initial }: { initial: DutySummary[] }) {
  const [days, setDays] = useState(1);
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function changeRange(d: number) {
    setDays(d);
    setLoading(true);
    try {
      const r = await api<{ summary: DutySummary[] }>(`/api/tracking/status?days=${d}`);
      setSummary(r.summary);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Location sharing — on/off history"
        subtitle="When each rep switched duty-sharing on and off, and any permission denials"
        action={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => changeRange(r.days)}
                className={clsx("rounded-md px-2.5 py-1 text-xs font-medium transition", days === r.days ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      {summary.length === 0 ? (
        <EmptyState icon={<Radio className="h-5 w-5" />} title="No duty activity yet" body="On/off events appear here once a rep toggles duty-sharing in the field app." />
      ) : (
        <ul className={clsx("divide-y divide-slate-100", loading && "opacity-50")}>
          {summary.map((s) => {
            const isOpen = expanded === s.userId;
            return (
              <li key={s.userId}>
                <button onClick={() => setExpanded(isOpen ? null : s.userId)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <div className="relative">
                    <Avatar name={s.name} color={s.avatarColor} size={32} />
                    <span className={clsx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white", s.onDuty ? "bg-emerald-500" : "bg-slate-300")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
                    <div className="text-[11px] text-slate-500">{s.onDuty ? "On duty now" : "Off duty"} · {formatDuration(s.totalOnDutyMs)} sharing in range</div>
                  </div>
                  {s.permissionDenials > 0 && (
                    <Badge tone="red">
                      <ShieldOff className="h-3 w-3" /> {s.permissionDenials} permission denial{s.permissionDenials > 1 ? "s" : ""}
                    </Badge>
                  )}
                  <ChevronDown className={clsx("h-4 w-4 text-slate-400 transition", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="bg-slate-50 px-4 py-3">
                    {s.segments.length === 0 ? (
                      <p className="text-xs text-slate-500">No on/off events in this range.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-slate-600">
                        {[...s.segments].reverse().map((seg, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Radio className="h-3 w-3 text-emerald-600" />
                            {format(new Date(seg.onAt), "d MMM, h:mm a")}
                            <span className="text-slate-400">→</span>
                            {seg.offAt ? format(new Date(seg.offAt), "d MMM, h:mm a") : <span className="font-medium text-emerald-700">still on</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
