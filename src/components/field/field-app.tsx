"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow } from "date-fns";
import clsx from "clsx";
import { Navigation, Phone, Crosshair, FileText, CheckCircle2, MapPin, Clock, Radio, Loader2, XCircle } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "../ui";
import { TemperatureBadge, VerdictBadge } from "../badges";
import { Modal } from "../modal";
import { api, getGpsFix, reportLocationStatus } from "@/lib/client";
import { useToast } from "../toast";
import { formatINR, humanize } from "@/lib/text";

export interface FieldAppt {
  id: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string;
  address: string | null;
  notes: string | null;
  checkInVerdict: string | null;
  checkInDistanceM: number | null;
  lead: { id: string; name: string; phone: string; temperature: string; score: number; lat: number | null; lng: number | null; monthlyBill: number | null; recommendedKw: number | null; city: string | null };
}

export function FieldApp({ appointments, name }: { appointments: FieldAppt[]; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [onDuty, setOnDuty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, { label: string; passed: boolean; detail: string }[]>>({});
  const [complete, setComplete] = useState<FieldAppt | null>(null);

  useEffect(() => {
    try {
      setOnDuty(localStorage.getItem("sf-on-duty") === "1");
    } catch {}
  }, []);

  // Best-effort: log browser location-permission changes (grant/revoke) outside the duty toggle,
  // e.g. the user flips it in their OS/browser settings while the app is open.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => status && reportLocationStatus(status.state === "granted" ? "PERMISSION_GRANTED" : "PERMISSION_DENIED");
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, []);

  // Heartbeat while on duty and the app is open (foreground only — battery friendly, privacy respecting).
  useEffect(() => {
    if (!onDuty) return;
    let stopped = false;
    const beat = () =>
      getGpsFix(100, 15000)
        .then((f) => !stopped && api("/api/tracking", { body: { lat: f.lat, lng: f.lng, accuracyM: f.accuracyM, deviceTime: f.deviceTime } }))
        .catch(() => {});
    beat();
    const t = setInterval(beat, 5 * 60_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [onDuty]);

  function toggleDuty() {
    const next = !onDuty;
    setOnDuty(next);
    try {
      localStorage.setItem("sf-on-duty", next ? "1" : "0");
    } catch {}
    reportLocationStatus(next ? "ON_DUTY" : "OFF_DUTY");
    toast.info(next ? "You're on duty" : "Off duty", next ? "Location is shared every 5 minutes while this app is open." : "Location sharing stopped.");
  }

  async function checkIn(a: FieldAppt) {
    setBusy(a.id);
    try {
      const fix = await getGpsFix(30, 20000);
      const r = await api<{ validation: { verdict: string; checks: { key: string; label: string; passed: boolean; detail: string }[] } }>(`/api/appointments/${a.id}`, {
        body: { action: "checkIn", capture: fix },
      });
      setChecks((c) => ({ ...c, [a.id]: r.validation.checks }));
      if (r.validation.verdict === "VERIFIED") toast.success("Checked in — location verified ✓");
      else toast.info(`Checked in — ${humanize(r.validation.verdict)}`, "Your manager will see this flag.");
      router.refresh();
    } catch (e) {
      toast.error("Check-in failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const groups = [
    { label: "Today", items: appointments.filter((a) => isToday(new Date(a.startAt))) },
    { label: "Tomorrow", items: appointments.filter((a) => isTomorrow(new Date(a.startAt))) },
    { label: "Later", items: appointments.filter((a) => !isToday(new Date(a.startAt)) && !isTomorrow(new Date(a.startAt))) },
  ];
  const todayDone = groups[0].items.filter((a) => a.status === "COMPLETED").length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="sun-gradient relative overflow-hidden rounded-2xl p-5 text-white shadow-sm">
        <div className="text-xs font-medium text-white/80">{format(new Date(), "EEEE, d MMMM")}</div>
        <div className="font-display text-xl font-bold">Hi {name.split(" ")[0]} 👋</div>
        <div className="mt-1 text-sm text-white/90">
          {groups[0].items.length} visit{groups[0].items.length === 1 ? "" : "s"} today · {todayDone} completed
        </div>
        <button
          onClick={toggleDuty}
          className={clsx("mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition", onDuty ? "bg-white text-emerald-700" : "bg-white/20 text-white hover:bg-white/30")}
        >
          <Radio className={clsx("h-3.5 w-3.5", onDuty && "animate-pulse")} />
          {onDuty ? "On duty · sharing location" : "Start duty"}
        </button>
      </div>

      {appointments.length === 0 && (
        <Card>
          <EmptyState icon={<MapPin className="h-5 w-5" />} title="No visits scheduled" body="New site visits booked for you will appear here and in your Google Calendar." />
        </Card>
      )}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
              <div className="space-y-3">
                {g.items.map((a) => {
                  const done = a.status === "COMPLETED";
                  const inside = a.status === "CHECKED_IN";
                  const dest = a.lead.lat != null ? `${a.lead.lat},${a.lead.lng}` : encodeURIComponent(a.address ?? a.lead.city ?? "");
                  return (
                    <Card key={a.id} className={clsx("overflow-hidden", done && "opacity-70")}>
                      <div className="flex items-start gap-3 p-4">
                        <div className={clsx("w-16 shrink-0 rounded-xl py-2 text-center", inside ? "bg-sky-50" : done ? "bg-emerald-50" : "bg-slate-50")}>
                          <div className="text-lg font-bold leading-none text-slate-800">{format(new Date(a.startAt), "h:mm")}</div>
                          <div className="text-[10px] font-medium uppercase text-slate-500">{format(new Date(a.startAt), "a")}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link href={`/leads/${a.lead.id}`} className="font-semibold text-slate-900 hover:text-sun-700">
                              {a.lead.name}
                            </Link>
                            <TemperatureBadge value={a.lead.temperature} />
                          </div>
                          <div className="text-xs text-slate-500">
                            {humanize(a.type)}
                            {a.lead.monthlyBill ? ` · Bill ${formatINR(a.lead.monthlyBill)}` : ""}
                            {a.lead.recommendedKw ? ` · ~${a.lead.recommendedKw} kW` : ""}
                          </div>
                          {a.address && (
                            <div className="mt-1 flex items-start gap-1 text-xs text-slate-600">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {a.address}
                            </div>
                          )}
                          {a.notes && <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{a.notes}</div>}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {inside && <Badge tone="sky">● On site</Badge>}
                            {done && <Badge tone="green">Completed</Badge>}
                            {a.checkInVerdict && <VerdictBadge value={a.checkInVerdict} />}
                            {a.checkInDistanceM != null && <span className="text-[11px] text-slate-400">{a.checkInDistanceM} m from site</span>}
                          </div>
                          {checks[a.id] && (
                            <ul className="mt-2 space-y-0.5">
                              {checks[a.id].map((c) => (
                                <li key={c.label} className="flex items-center gap-1 text-[11px] text-slate-600">
                                  {c.passed ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3 text-rose-600" />}
                                  {c.label}: {c.detail}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      {!done && (
                        <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100 text-[11px] font-medium">
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 py-2.5 text-sky-700 hover:bg-sky-50">
                            <Navigation className="h-4 w-4" /> Navigate
                          </a>
                          <a href={`tel:+${a.lead.phone}`} className="flex flex-col items-center gap-1 py-2.5 text-emerald-700 hover:bg-emerald-50">
                            <Phone className="h-4 w-4" /> Call
                          </a>
                          {inside ? (
                            <Link href={`/field/quote/${a.lead.id}`} className="flex flex-col items-center gap-1 py-2.5 text-sun-700 hover:bg-sun-50">
                              <FileText className="h-4 w-4" /> Quote
                            </Link>
                          ) : (
                            <button onClick={() => checkIn(a)} disabled={busy === a.id} className="flex flex-col items-center gap-1 py-2.5 text-sun-700 hover:bg-sun-50 disabled:opacity-60">
                              {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Check in
                            </button>
                          )}
                          <button onClick={() => setComplete(a)} className="flex flex-col items-center gap-1 py-2.5 text-slate-700 hover:bg-slate-50">
                            <CheckCircle2 className="h-4 w-4" /> Complete
                          </button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ),
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
        <Clock className="h-3 w-3" /> Check-ins and quotations record server time + GPS and are verified against the customer site.
      </p>
      <CompleteModal appt={complete} onClose={() => setComplete(null)} />
    </div>
  );
}

const DELIVERABLES = ["Quotation PDF", "Visiting card", "Brochure", "Measurement/photos", "Loan document checklist", "Sample panel"];

function CompleteModal({ appt, onClose }: { appt: FieldAppt | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [outcome, setOutcome] = useState("");
  const [itemsGiven, setItemsGiven] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  async function save(noShow = false) {
    if (!appt) return;
    setSaving(true);
    try {
      if (noShow) await api(`/api/appointments/${appt.id}`, { body: { action: "update", status: "NO_SHOW" } });
      else await api(`/api/appointments/${appt.id}`, { body: { action: "checkOut", outcome: outcome || null, itemsGiven } });
      toast.success(noShow ? "Marked as no-show" : "Visit completed");
      setOutcome("");
      setItemsGiven([]);
      onClose();
      router.refresh();
    } catch (e) {
      toast.error("Could not update", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }
  function toggleItem(item: string) {
    setItemsGiven((cur) => (cur.includes(item) ? cur.filter((i) => i !== item) : [...cur, item]));
  }
  return (
    <Modal
      open={!!appt}
      onClose={onClose}
      title={`Complete visit · ${appt?.lead.name ?? ""}`}
      footer={
        <>
          <Button onClick={() => save(true)} loading={saving}>
            Customer no-show
          </Button>
          <Button variant="primary" onClick={() => save(false)} loading={saving}>
            Complete
          </Button>
        </>
      }
    >
      <label className="label">Visit outcome</label>
      <textarea className="input min-h-[110px]" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Roof condition, usable area, shading, customer's decision, next step…" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Roof OK — quotation shared", "Needs family discussion", "Loan documents collected", "Roof needs repair first", "Shading issue — resize"].map((s) => (
          <button key={s} type="button" onClick={() => setOutcome((o) => (o ? `${o}. ${s}` : s))} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-sun-400">
            {s}
          </button>
        ))}
      </div>
      <label className="label mt-4">Given to customer</label>
      <div className="flex flex-wrap gap-1.5">
        {DELIVERABLES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => toggleItem(item)}
            className={clsx(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
              itemsGiven.includes(item) ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-sun-400",
            )}
          >
            {itemsGiven.includes(item) ? "✓ " : ""}{item}
          </button>
        ))}
      </div>
    </Modal>
  );
}
