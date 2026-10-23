"use client";

import { TimeAgo } from "../time-ago";
import { useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { Map, type MapMarker } from "../map/map";
import { Avatar, Card, CardHeader, EmptyState } from "../ui";
import { VerdictBadge } from "../badges";
import { formatINR } from "@/lib/text";

export interface TeamMember {
  id: string;
  name: string;
  avatarColor: string;
  territory: string | null;
  last: { lat: number; lng: number; createdAt: string; source: string } | null;
  trail: { lat: number; lng: number; createdAt: string }[];
  stats: { quotes: number; verified: number; flagged: number; checkIns: number };
}

export interface TrackedQuote {
  id: string;
  number: string;
  geoVerdict: string;
  serverTime: string;
  distanceFromSiteM: number | null;
  capturedLat: number | null;
  capturedLng: number | null;
  netCost: number;
  reviewNote: string | null;
  createdBy: { id: string; name: string };
  lead: { id: string; name: string; lat: number | null; lng: number | null };
}

export function TrackingBoard({ team, quotes, focusQuote, geofenceM }: { team: TeamMember[]; quotes: TrackedQuote[]; focusQuote?: string; geofenceM: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [focus, setFocus] = useState<string | null>(focusQuote ?? null);

  const shownQuotes = quotes.filter((q) => (!onlyFlagged || !["VERIFIED", "OFFICE_CREATED"].includes(q.geoVerdict)) && (!selected || q.createdBy.id === selected));
  const fq = quotes.find((q) => q.id === focus);

  const { markers, lines, circles } = useMemo(() => {
    const markers: MapMarker[] = [];
    const lines: { points: [number, number][]; color?: string; dashed?: boolean }[] = [];
    const circles: { lat: number; lng: number; radiusM: number; color?: string }[] = [];
    if (fq && fq.capturedLat != null && fq.capturedLng != null) {
      if (fq.lead.lat != null && fq.lead.lng != null) {
        markers.push({ id: "site", lat: fq.lead.lat, lng: fq.lead.lng, color: "#ea580c", label: `${fq.lead.name} — site` });
        circles.push({ lat: fq.lead.lat, lng: fq.lead.lng, radiusM: geofenceM });
        lines.push({ points: [[fq.lead.lat, fq.lead.lng], [fq.capturedLat, fq.capturedLng]], color: "#dc2626", dashed: true });
      }
      markers.push({ id: "cap", lat: fq.capturedLat, lng: fq.capturedLng, color: "#dc2626", label: `${fq.number} captured by ${fq.createdBy.name}`, ring: true });
      return { markers, lines, circles };
    }
    for (const m of team) {
      if (selected && m.id !== selected) continue;
      if (m.trail.length > 1) lines.push({ points: m.trail.map((p) => [p.lat, p.lng]), color: m.avatarColor });
      if (m.last)
        markers.push({
          id: m.id,
          lat: m.last.lat,
          lng: m.last.lng,
          color: m.avatarColor,
          radius: 10,
          ring: true,
          label: `${m.name} · ${formatDistanceToNow(new Date(m.last.createdAt), { addSuffix: true })}`,
        });
    }
    return { markers, lines, circles };
  }, [team, selected, fq, geofenceM]);

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Card className="xl:max-h-[calc(100vh-160px)] xl:overflow-y-auto">
        <CardHeader title="Field team" subtitle="Last known position & 30-day validation record" />
        <ul className="divide-y divide-slate-100">
          {team.map((m) => {
            const stale = !m.last || Date.now() - new Date(m.last.createdAt).getTime() > 30 * 60_000;
            const pct = m.stats.quotes ? Math.round((m.stats.verified / m.stats.quotes) * 100) : null;
            return (
              <li key={m.id}>
                <button
                  onClick={() => {
                    setFocus(null);
                    setSelected((s) => (s === m.id ? null : m.id));
                  }}
                  className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50", selected === m.id && "bg-sun-50/60")}
                >
                  <div className="relative">
                    <Avatar name={m.name} color={m.avatarColor} size={34} />
                    <span suppressHydrationWarning className={clsx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white", stale ? "bg-slate-300" : "bg-emerald-500")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{m.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{m.last ? <>Seen <TimeAgo date={m.last.createdAt} /></> : "No location today"}</div>
                  </div>
                  <div className="text-right">
                    <div className={clsx("text-sm font-semibold tabular-nums", pct == null ? "text-slate-300" : pct >= 90 ? "text-emerald-700" : pct >= 70 ? "text-amber-700" : "text-rose-700")}>{pct == null ? "—" : `${pct}%`}</div>
                    <div className="text-[10px] text-slate-400">{m.stats.quotes} quotes</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="space-y-6">
        <Card className="p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-sm font-semibold">{fq ? `${fq.number} — captured ${fq.distanceFromSiteM ?? "?"} m from site` : selected ? `${team.find((t) => t.id === selected)?.name}'s route today` : "Team positions & routes today"}</div>
            {fq && (
              <button onClick={() => setFocus(null)} className="text-xs font-medium text-sun-700 hover:underline">
                Back to team map
              </button>
            )}
          </div>
          <Map height={420} markers={markers} lines={lines} circles={circles} />
        </Card>

        <Card>
          <CardHeader
            title="Quotation validation log"
            subtitle="Who quoted whom, where and when"
            action={
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="accent-amber-500" />
                Flagged only
              </label>
            }
          />
          {shownQuotes.length === 0 ? (
            <EmptyState title={onlyFlagged ? "No flagged quotations 🎉" : "No quotations"} body="All field quotations were created at the customer site within the scheduled slot." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-3 py-2">Salesperson</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Verdict</th>
                    <th className="px-3 py-2 text-right">Distance</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownQuotes.map((q) => (
                    <tr key={q.id} className={clsx("hover:bg-slate-50", focus === q.id && "bg-rose-50/50")}>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{format(new Date(q.serverTime), "d MMM, h:mm a")}</td>
                      <td className="px-3 py-2.5">{q.createdBy.name}</td>
                      <td className="px-3 py-2.5">
                        <Link href={`/leads/${q.lead.id}`} className="hover:text-sun-700">
                          {q.lead.name}
                        </Link>
                        <div className="text-[11px] text-slate-400">
                          {q.number} · {formatINR(q.netCost)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <VerdictBadge value={q.geoVerdict} />
                        {q.reviewNote && <div className="mt-0.5 max-w-[14rem] truncate text-[11px] text-slate-500">{q.reviewNote}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">{q.distanceFromSiteM != null ? `${q.distanceFromSiteM.toLocaleString("en-IN")} m` : "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          {q.capturedLat != null && (
                            <button onClick={() => setFocus(q.id)} className="text-xs font-medium text-sky-700 hover:underline">
                              Map
                            </button>
                          )}
                          <Link href={`/quotations/${q.id}`} className="text-xs font-medium text-sun-700 hover:underline">
                            Review
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
            {["VERIFIED", "OUT_OF_RANGE", "TIME_MISMATCH", "CLOCK_TAMPER", "IMPOSSIBLE_TRAVEL", "SITE_UNPINNED", "LOW_ACCURACY"].map((v) => (
              <span key={v} className="flex items-center gap-1">
                <VerdictBadge value={v} />
              </span>
            ))}
            <span className="self-center text-slate-400">Hover a badge for its meaning.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
