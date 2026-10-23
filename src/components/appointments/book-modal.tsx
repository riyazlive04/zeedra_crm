"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import { CalendarCheck2, CalendarX2 } from "lucide-react";
import clsx from "clsx";
import { Modal } from "../modal";
import { Button, Field } from "../ui";
import { api } from "@/lib/client";
import { useToast } from "../toast";
import { APPT_TYPES } from "@/lib/validators";
import { humanize } from "@/lib/text";

interface Slot {
  start: string;
  end: string;
  available: boolean;
}

export function BookAppointmentModal({
  open,
  onClose,
  lead,
  users,
  defaultUserId,
  defaultType = "SITE_VISIT",
}: {
  open: boolean;
  onClose: () => void;
  lead: { id: string; name: string; address?: string | null };
  users: { id: string; name: string; role: string }[];
  defaultUserId?: string | null;
  defaultType?: (typeof APPT_TYPES)[number];
}) {
  const router = useRouter();
  const toast = useToast();
  const [userId, setUserId] = useState(defaultUserId ?? users.find((u) => u.role === "FIELD_SALES")?.id ?? users[0]?.id ?? "");
  const [type, setType] = useState<(typeof APPT_TYPES)[number]>(defaultType);
  const [date, setDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [google, setGoogle] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !userId || !date) return;
    setSlots(null);
    setPicked(null);
    api<{ slots: Slot[]; googleConnected: boolean }>(`/api/appointments/slots?userId=${userId}&date=${date}`)
      .then((r) => {
        setSlots(r.slots);
        setGoogle(r.googleConnected);
      })
      .catch((e) => {
        setSlots([]);
        toast.error("Could not load availability", e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, date]);

  async function book() {
    if (!picked) return;
    setSaving(true);
    try {
      await api("/api/appointments", { body: { leadId: lead.id, assignedToId: userId, type, startAt: picked, durationMinutes: duration, notes: notes || null, address: lead.address ?? null } });
      toast.success(`${humanize(type)} booked`, `${format(new Date(picked), "EEE d MMM, h:mm a")} — confirmation sent on WhatsApp${google ? " & added to Google Calendar" : ""}.`);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Booking failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Book appointment · ${lead.name}`}
      subtitle="Free slots account for existing visits, a 15-minute travel buffer and the salesperson's Google Calendar."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={book} loading={saving} disabled={!picked}>
            <CalendarCheck2 className="h-4 w-4" /> Confirm booking
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {APPT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Salesperson">
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {humanize(u.role)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duration">
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[30, 45, 60, 90, 120, 240].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} hr`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d) => {
            const v = format(d, "yyyy-MM-dd");
            return (
              <button
                type="button"
                key={v}
                onClick={() => setDate(v)}
                className={clsx("min-w-[64px] rounded-xl border px-2 py-2 text-center transition", v === date ? "border-sun-500 bg-sun-50 ring-1 ring-sun-500/30" : "border-slate-200 hover:border-slate-300")}
              >
                <div className="text-[10px] font-semibold uppercase text-slate-500">{format(d, "EEE")}</div>
                <div className="text-base font-bold text-slate-800">{format(d, "d")}</div>
                <div className="text-[10px] text-slate-400">{format(d, "MMM")}</div>
              </button>
            );
          })}
          <input type="date" className="input w-auto" value={date} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} aria-label="Pick another date" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Available slots</span>
            <span className={clsx("text-[11px]", google ? "text-emerald-600" : "text-slate-400")}>{google ? "● Google Calendar connected" : "Google Calendar not connected for this user"}</span>
          </div>
          {slots === null ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              <CalendarX2 className="h-4 w-4" /> Non-working day. Pick another date.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.map((s) => (
                <button
                  type="button"
                  key={s.start}
                  disabled={!s.available}
                  onClick={() => setPicked(s.start)}
                  className={clsx(
                    "h-9 rounded-lg border text-sm font-medium transition",
                    !s.available && "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through",
                    s.available && picked !== s.start && "border-slate-200 text-slate-700 hover:border-sun-400 hover:bg-sun-50",
                    picked === s.start && "sun-gradient border-transparent text-white shadow-sm",
                  )}
                >
                  {format(new Date(s.start), "h:mm a")}
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label="Notes for the salesperson">
          <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Landmark, customer preferences, documents to carry…" />
        </Field>
      </div>
    </Modal>
  );
}
