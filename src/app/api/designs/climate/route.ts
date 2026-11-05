import { route, searchParams } from "@/lib/api";
import { ApiError } from "@/lib/errors";

/**
 * Monthly clearness (all-sky ÷ clear-sky surface irradiance) and temperature extremes from the
 * NASA POWER climatology API — free, no key. Used to turn clear-sky shading simulation into a
 * realistic yield for the site, and to size strings for the site's real temperatures.
 */
const cache = new Map<string, { at: number; value: unknown }>();

export const GET = route(null, async ({ req }) => {
  const q = searchParams(req);
  const lat = Number(q.get("lat")), lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, "Invalid coordinates");
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 7 * 86400000) return hit.value;
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,T2M_MIN,T2M_MAX` +
    `&community=RE&longitude=${lng.toFixed(3)}&latitude=${lat.toFixed(3)}&format=JSON`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (!res?.ok) throw new ApiError(502, "Weather data isn't available right now, so we're using a default clearness of 0.75");
  const json = (await res.json()) as { properties?: { parameter?: Record<string, Record<string, number>> } };
  const p = json.properties?.parameter;
  if (!p?.ALLSKY_SFC_SW_DWN || !p?.CLRSKY_SFC_SW_DWN) throw new ApiError(502, "Weather data incomplete");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const clearness = months.map((m) => {
    const a = p.ALLSKY_SFC_SW_DWN[m], c = p.CLRSKY_SFC_SW_DWN[m];
    return a > 0 && c > 0 ? Math.min(1, Math.max(0.2, a / c)) : 0.75;
  });
  const ghiMonthly = months.map((m) => p.ALLSKY_SFC_SW_DWN[m]);
  const minC = Math.min(...months.map((m) => p.T2M_MIN?.[m] ?? 15));
  const maxC = Math.max(...months.map((m) => p.T2M_MAX?.[m] ?? 38));
  const value = { clearness, ghiMonthly, minC: Math.floor(minC - 5), maxC: Math.ceil(maxC), source: "NASA POWER climatology" };
  cache.set(key, { at: Date.now(), value });
  return value;
});
