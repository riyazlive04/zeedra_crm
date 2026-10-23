import { route, searchParams } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { ApiError } from "@/lib/errors";

/** Address → coordinates via OpenStreetMap Nominatim (server-side, with required User-Agent). */
export const GET = route(null, async ({ req, session }) => {
  const q = searchParams(req).get("q")?.trim();
  if (!q || q.length < 4) throw new ApiError(400, "Enter a longer address");
  await rateLimit(`geocode:${session.orgId}`, 300, 3600);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": `SirahZeedraSolar-CRM/1.0 (${process.env.APP_URL ?? "localhost"})`, "Accept-Language": "en" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) throw new ApiError(502, "Address lookup is unavailable right now — drop the pin on the map instead");
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: r.display_name }));
});
