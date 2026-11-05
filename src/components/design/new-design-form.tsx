"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Loader2, LocateFixed } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { Map } from "@/components/map/map";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

type Lead = { id: string; name: string; code: string; lat: number | null; lng: number | null; address: string };
type Place = { lat: number; lng: number; label: string };

const COORDS = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;
const DEFAULT_CENTER: [number, number] = [13.0827, 80.2707]; // Chennai

/** New roof design for any address: search, paste coordinates, use GPS, or click the roof on the map. */
export function NewDesignForm({ lead }: { lead: Lead | null }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(lead ? `${lead.name} rooftop` : "");
  const [q, setQ] = useState(lead?.address ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [pick, setPick] = useState<Place | null>(lead?.lat != null && lead?.lng != null ? { lat: lead.lat, lng: lead.lng, label: "Lead's site location" } : null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const search = async () => {
    const m = q.trim().match(COORDS);
    if (m) return setPick({ lat: Number(m[1]), lng: Number(m[2]), label: "Coordinates" });
    if (q.trim().length < 4) return toast.error("Type a longer address, or click the roof on the map");
    setBusy(true);
    try {
      const r = await api<Place[]>(`/api/geocode?q=${encodeURIComponent(q)}`);
      setResults(r);
      if (r.length === 1) { setPick(r[0]); setResults([]); }
      if (!r.length) toast.error("No match", "Try a landmark nearby, or just click the roof on the map");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available in this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPick({ lat: p.coords.latitude, lng: p.coords.longitude, label: "My current location" }); setLocating(false); },
      () => { toast.error("Couldn't get your location"); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const create = async () => {
    if (!pick) return toast.error("Choose the site first", "Search an address or click the roof on the map");
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
      {lead ? (
        <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">For lead <b>{lead.code}</b> · {lead.name}</div>
      ) : (
        <p className="text-xs text-slate-500">Works for any address, no lead needed. You can link it to a lead later from the lead page.</p>
      )}
      <label className="block text-sm text-slate-600">
        Design name
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. Kumar residence terrace" />
      </label>
      <div className="text-sm text-slate-600">
        Site location
        <div className="mt-1 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Address, landmark or lat, lng" />
          <button type="button" onClick={search} className="rounded-lg border border-slate-200 px-3 hover:bg-slate-50" aria-label="Search">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
          <button type="button" onClick={locate} className="rounded-lg border border-slate-200 px-3 hover:bg-slate-50" title="Use my location" aria-label="Use my location">
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {results.length > 1 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
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
      <div>
        <Map
          tiles="satellite"
          height={260}
          zoom={pick ? 19 : 12}
          center={pick ? [pick.lat, pick.lng] : DEFAULT_CENTER}
          markers={pick ? [{ id: "site", lat: pick.lat, lng: pick.lng, color: "#0d9488", label: "Site" }] : []}
          onPick={(lat, lng) => setPick({ lat, lng, label: "Picked on map" })}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          {pick ? <>📍 {pick.label} ({pick.lat.toFixed(5)}, {pick.lng.toFixed(5)}). Click the map to move the pin.</> : "Click the roof on the map to drop a pin."}
        </p>
      </div>
      <Button variant="primary" className="w-full" onClick={create} loading={busy} disabled={!pick}>
        Open design editor
      </Button>
    </Card>
  );
}
