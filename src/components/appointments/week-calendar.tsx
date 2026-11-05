"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, isSameDay, isToday } from "date-fns";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, MapPin, Phone, CalendarClock, Ban, UserX, CalendarPlus, Search } from "lucide-react";
import { Avatar, Badge, Button, Field } from "../ui";
import { Modal } from "../modal";
import { VerdictBadge } from "../badges";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import { displayPhone, humanize } from "@/lib/text";
import { APPT_TYPES } from "@/lib/validators";

export interface CalAppt {
  id: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string;
  address: string | null;
  notes: string | null;
  googleEventId: string | null;
  googleSyncError: string | null;
  checkInVerdict: string | null;
  lead: { id: string; name: string; phone: string; city: string | null };
  assignedTo: { id: string; name: string; avatarColor: string };
}

const START_HOUR = 8;
const END_HOUR = 20;
const ROW = 52;

export function WeekCalendar({ weekStart, appointments, users, userFilter, me, canBook }: { weekStart: string; appointments: CalAppt[]; users: { id: string; name: string; avatarColor: string }[]; userFilter: string | null; me: { id: string; name: string }; canBook: boolean }) {
  const router = useRouter();
  const start = new Date(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [open, setOpen] = useState<CalAppt | null>(null);
  const [newAt, setNewAt] = useState<Date | null>(null);
  const [hover, setHover] = useState<{ day: number; slot: number } | null>(null);
  // Click an empty spot → book at that time (snapped to 30 minutes).
  const slotAt = (d: Date, y: number) => {
    const half = Math.max(0, Math.min((END_HOUR - START_HOUR) * 2 - 1, Math.floor(y / (ROW / 2))));
    const t = new Date(d);
    t.setHours(START_HOUR + Math.floor(half / 2), (half % 2) * 30, 0, 0);
    return { t, half };
  };
  const nav = (d: Date, u = userFilter) => router.push(`/appointments?week=${format(d, "yyyy-MM-dd")}${u ? `&user=${u}` : ""}`);
  const now = new Date();

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Button size="sm" onClick={() => nav(addDays(start, -7))} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={() => nav(addDays(new Date(), -((new Date().getDay() + 6) % 7)))}>
          This week
        </Button>
        <Button size="sm" onClick={() => nav(addDays(start, 7))} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm font-semibold text-slate-800">
          {format(days[0], "d MMM")} – {format(days[6], "d MMM yyyy")}
        </span>
        {users.length > 1 && (
          <select className="input ml-auto h-8 w-auto py-0 text-xs" value={userFilter ?? ""} onChange={(e) => nav(start, e.target.value || null)}>
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-100 bg-slate-50/60">
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className={clsx("px-2 py-2 text-center", isToday(d) && "bg-sun-50")}>
                <div className="text-[10px] font-semibold uppercase text-slate-500">{format(d, "EEE")}</div>
                <div className={clsx("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold", isToday(d) ? "sun-gradient text-white" : "text-slate-800")}>{format(d, "d")}</div>
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
            <div>
              {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                <div key={i} style={{ height: ROW }} className="border-b border-slate-50 pr-2 pt-1 text-right text-[10px] text-slate-400">
                  {format(new Date(2026, 0, 1, START_HOUR + i), "h a")}
                </div>
              ))}
            </div>
            {days.map((d, di) => {
              const list = appointments.filter((a) => isSameDay(new Date(a.startAt), d));
              return (
                <div
                  key={d.toISOString()}
                  className={clsx("relative border-l border-slate-100", isToday(d) && "bg-sun-50/30", canBook && "cursor-pointer")}
                  onMouseMove={(e) => {
                    if (!canBook || (e.target as HTMLElement).closest("button")) return setHover(null);
                    const { half } = slotAt(d, e.clientY - e.currentTarget.getBoundingClientRect().top);
                    setHover({ day: di, slot: half });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    if (!canBook || (e.target as HTMLElement).closest("button")) return;
                    const { t } = slotAt(d, e.clientY - e.currentTarget.getBoundingClientRect().top);
                    if (t.getTime() < Date.now() - 5 * 60_000) return;
                    setNewAt(t);
                  }}
                >
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <div key={i} style={{ height: ROW }} className="border-b border-slate-50" />
                  ))}
                  {hover?.day === di && (
                    <div className="pointer-events-none absolute inset-x-1 z-0 flex items-center gap-1 rounded-md border border-dashed border-sun-400 bg-sun-50/80 px-1.5 text-[10px] font-medium text-sun-700" style={{ top: hover.slot * (ROW / 2), height: ROW / 2 - 2 }}>
                      <CalendarPlus className="h-3 w-3" /> {format(slotAt(d, hover.slot * (ROW / 2) + 1).t, "h:mm a")}
                    </div>
                  )}
                  {isToday(d) && now.getHours() >= START_HOUR && now.getHours() < END_HOUR && (
                    <div suppressHydrationWarning className="absolute inset-x-0 z-10 border-t-2 border-rose-500" style={{ top: (now.getHours() - START_HOUR + now.getMinutes() / 60) * ROW }} />
                  )}
                  {list.map((a) => {
                    const s = new Date(a.startAt);
                    const e = new Date(a.endAt);
                    const top = Math.max(0, (s.getHours() - START_HOUR + s.getMinutes() / 60) * ROW);
                    const h = Math.max(24, ((e.getTime() - s.getTime()) / 3_600_000) * ROW - 3);
                    const cancelled = a.status === "CANCELLED" || a.status === "NO_SHOW";
                    return (
                      <button
                        key={a.id}
                        onClick={() => setOpen(a)}
                        className={clsx("absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] bg-white px-1.5 py-1 text-left shadow-sm ring-1 ring-slate-200 transition hover:z-20 hover:shadow-md", cancelled && "opacity-50 line-through")}
                        style={{ top, height: h, borderLeftColor: a.assignedTo.avatarColor }}
                      >
                        <div className="truncate text-[11px] font-semibold text-slate-800">{a.lead.name}</div>
                        <div className="truncate text-[10px] text-slate-500">
                          {format(s, "h:mm")} · {humanize(a.type)}
                        </div>
                        {h > 44 && <div className="truncate text-[10px] text-slate-400">{a.assignedTo.name}</div>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ApptModal appt={open} users={users} onClose={() => setOpen(null)} />
      {newAt && <NewApptModal at={newAt} users={users.length ? users : [{ ...me, avatarColor: "" }]} defaultUserId={userFilter ?? (users.some((u) => u.id === me.id) ? me.id : users[0]?.id ?? me.id)} onClose={() => setNewAt(null)} />}
    </div>
  );
}

/** Book from an empty calendar slot: pick the lead and the team member; time comes from the click. */
function NewApptModal({ at, users, defaultUserId, onClose }: { at: Date; users: { id: string; name: string }[]; defaultUserId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<{ id: string; name: string; code: string; phone: string; address: string | null; city: string | null }[]>([]);
  const [lead, setLead] = useState<(typeof leads)[number] | null>(null);
  const [userId, setUserId] = useState(defaultUserId);
  const [type, setType] = useState<(typeof APPT_TYPES)[number]>("SITE_VISIT");
  const [when, setWhen] = useState(format(at, "yyyy-MM-dd'T'HH:mm"));
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (lead) return;
    const t = setTimeout(() => {
      api<{ items: typeof leads }>(`/api/leads?pageSize=8&open=1&q=${encodeURIComponent(q)}`).then((r) => setLeads(r.items ?? [])).catch(() => setLeads([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, lead]);
  async function book() {
    if (!lead) return;
    setSaving(true);
    try {
      await api("/api/appointments", { body: { leadId: lead.id, assignedToId: userId, type, startAt: new Date(when).toISOString(), durationMinutes: duration, notes: notes || null, address: [lead.address, lead.city].filter(Boolean).join(", ") || null } });
      toast.success(`${humanize(type)} booked`, `${format(new Date(when), "EEE d MMM, h:mm a")} with ${users.find((u) => u.id === userId)?.name ?? "your team"}`);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Couldn't book", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New appointment"
      subtitle={format(new Date(when), "EEEE d MMM yyyy, h:mm a")}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={book} loading={saving} disabled={!lead}>
            <CalendarPlus className="h-4 w-4" /> Book appointment
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {/* Not a <label>: a label forwards clicks to its first control, which would undo the pick. */}
        <div>
          <span className="label">Lead</span>
          {lead ? (
            <div className="flex items-center justify-between rounded-lg border border-sun-300 bg-sun-50 px-3 py-2">
              <div><div className="font-medium text-slate-800">{lead.name}</div><div className="text-xs text-slate-500">{lead.code} · {displayPhone(lead.phone)}{lead.city ? ` · ${lead.city}` : ""}</div></div>
              <button type="button" onClick={() => setLead(null)} className="text-xs font-medium text-sun-700 hover:underline">Change</button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input autoFocus className="input pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or lead code" />
              </div>
              <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                {leads.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => setLead(l)} className="w-full px-3 py-2 text-left hover:bg-slate-50">
                      <span className="font-medium text-slate-800">{l.name}</span> <span className="text-xs text-slate-400">{l.code} · {displayPhone(l.phone)}</span>
                    </button>
                  </li>
                ))}
                {leads.length === 0 && <li className="px-3 py-3 text-xs text-slate-400">No open leads found.</li>}
              </ul>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Team member">
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {APPT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
          </Field>
          <Field label="Date & time">
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Duration">
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[30, 45, 60, 90, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Landmark, what to carry, customer preferences" />
        </Field>
        <p className="text-xs text-slate-500">We&apos;ll check the team member&apos;s other visits (with a 15-minute travel buffer) and send the customer a WhatsApp confirmation.</p>
      </div>
    </Modal>
  );
}

function ApptModal({ appt, users, onClose }: { appt: CalAppt | null; users: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [when, setWhen] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(body: Record<string, unknown>, msg: string) {
    if (!appt) return;
    setBusy(true);
    try {
      await api(`/api/appointments/${appt.id}`, { body: { action: "update", ...body } });
      toast.success(msg);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (!appt) return null;
  const active = appt.status === "SCHEDULED";
  return (
    <Modal open onClose={onClose} title={`${humanize(appt.type)} · ${appt.lead.name}`} subtitle={`${format(new Date(appt.startAt), "EEEE d MMM, h:mm a")} – ${format(new Date(appt.endAt), "h:mm a")}`}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={appt.status === "COMPLETED" ? "green" : appt.status === "SCHEDULED" ? "blue" : appt.status === "CHECKED_IN" ? "sky" : "rose"}>{humanize(appt.status)}</Badge>
          {appt.googleEventId ? <Badge tone="blue">Synced to Google Calendar</Badge> : appt.googleSyncError ? <Badge tone="amber">Google: {appt.googleSyncError}</Badge> : <Badge tone="slate">Not on Google Calendar</Badge>}
          {appt.checkInVerdict && <VerdictBadge value={appt.checkInVerdict} />}
        </div>
        <div className="flex items-center gap-2">
          <Avatar name={appt.assignedTo.name} color={appt.assignedTo.avatarColor} size={26} /> {appt.assignedTo.name}
        </div>
        {appt.address && (
          <div className="flex gap-2 text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {appt.address}
          </div>
        )}
        <div className="flex gap-2 text-slate-600">
          <Phone className="mt-0.5 h-4 w-4 shrink-0" /> {displayPhone(appt.lead.phone)}
        </div>
        {appt.notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{appt.notes}</p>}
        <Link href={`/leads/${appt.lead.id}`} className="inline-block text-sm font-medium text-sun-700 hover:underline">
          Open lead →
        </Link>
        {active && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reschedule to">
                <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              </Field>
              <Field label="Reassign to">
                <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Keep {appt.assignedTo.name}</option>
                  {users
                    .filter((u) => u.id !== appt.assignedTo.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" loading={busy} disabled={!when && !assignee} onClick={() => update({ ...(when ? { startAt: new Date(when).toISOString() } : {}), ...(assignee ? { assignedToId: assignee } : {}) }, "Appointment updated")}>
                <CalendarClock className="h-4 w-4" /> Save changes
              </Button>
              <Button size="sm" loading={busy} onClick={() => update({ status: "NO_SHOW" }, "Marked as no-show")}>
                <UserX className="h-4 w-4" /> No-show
              </Button>
              <Button size="sm" variant="danger" loading={busy} onClick={() => confirm("Cancel this appointment?") && update({ status: "CANCELLED" }, "Appointment cancelled")}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
