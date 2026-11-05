"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Loader2 } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

type Lead = { id: string; name: string; code: string; lat: number | null; lng: number | null; address: string };
type Place = { lat: number; lng: number; label: string };

const COORDS = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

export function NewDesignForm({ lead }: { lead: Lead | null }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(lead ? `${lead.name} — rooftop` : "");
  const [q, setQ] = useState(lead?.address ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [pick, setPick] = useState<Place | null>(lead?.lat != null && lead?.lng != null ? { lat: lead.lat, lng: lead.lng, label: "Lead site location" } : null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    const m = q.trim().match(COORDS);
    if (m) return setPick({ lat: Number(m[1]), lng: Number(m[2]), label: "Coordinates" });
    setBusy(true);
    try {
      const r = await api<Place[]>(`/api/geocode?q=${encodeURIComponent(q)}`);
      setResults(r);
      if (!r.length) toast.error("No match", "Try a landmark, or paste coordinates like 13.0827, 80.2707");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!pick) return toast.error("Pick the site location first");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/designs", { body: { name: name.trim() || "Rooftop design", lat: pick.lat, lng: pick.lng, leadId: lead?.id ?? null } });
      router.push(`/designs/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card className="h-fit space-y-4 p-5">
      <h3 className="font-semibold text-slate-800">New design</h3>
      {lead && (
        <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          For lead <b>{lead.code}</b> · {lead.name}
        </div>
      )}
      <label className="block text-sm text-slate-600">
        Design name
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. Kumar residence — terrace" />
      </label>
      <div className="text-sm text-slate-600">
        Site location
        <div className="mt-1 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Address, landmark or lat, lng" />
          <button type="button" onClick={search} className="rounded-lg border border-slate-200 px-3 hover:bg-slate-50" aria-label="Search">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {results.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" onClick={() => { setPick(r); setResults([]); }} className="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pick && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <MapPin className="mr-1 inline h-3.5 w-3.5 text-teal-600" />
          {pick.label} ({pick.lat.toFixed(5)}, {pick.lng.toFixed(5)})
        </div>
      )}
      <Button variant="primary" className="w-full" onClick={create} loading={busy}>
        Open design editor
      </Button>
      <p className="text-xs text-slate-400">You can pan to the exact roof on the map before drawing.</p>
    </Card>
  );
}
