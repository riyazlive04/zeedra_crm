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

  const locate = async () => {
    if (!navigator.geolocation) return toast.error("This browser can't share your location", "Search the address or click the roof on the map instead.");
    // Browsers only allow location on HTTPS (or localhost).
    if (!window.isSecureContext) return toast.error("Location needs a secure (https://) connection", "Open the app on its https:// address, or click the roof on the map.");
    setLocating(true);
    const ask = (highAccuracy: boolean, timeout: number) =>
      new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: highAccuracy, timeout, maximumAge: highAccuracy ? 0 : 300000 }),
      );
    try {
      let p: GeolocationPosition;
      try {
        // GPS first (phones on site)…
        p = await ask(true, 8000);
      } catch (e) {
        if ((e as GeolocationPositionError).code === 1) throw e;
        // …then Wi-Fi / network location, which laptops and desktops without GPS can usually give.
        p = await ask(false, 15000);
      }
      const acc = Math.round(p.coords.accuracy);
      setPick({ lat: p.coords.latitude, lng: p.coords.longitude, label: acc > 100 ? `Approximate location (±${acc} m), click the exact roof` : `My current location (±${acc} m)` });
      if (acc > 100) toast.info("Got an approximate location", "Zoom in and click the exact roof to place the pin.");
    } catch (e) {
      const code = (e as GeolocationPositionError).code;
      if (code === 1) toast.error("Location permission is blocked", "Click the lock icon in the address bar, allow Location for this site, then try again.");
      else if (code === 3) toast.error("Location took too long", "Try again, or search the address / click the roof on the map.");
      else toast.error("Your device couldn't find its location", "Turn on location services (Windows: Settings › Privacy › Location), or click the roof on the map.");
    } finally {
      setLocating(false);
    }
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
