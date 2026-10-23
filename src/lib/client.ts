"use client";

export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** fetch wrapper for our JSON API: throws ClientError with the server's message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : { "Content-Type": "application/json" },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: "same-origin",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.includes("/api/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    const d = data as { error?: string; details?: { path: string; message: string }[] };
    const detail = d?.details?.length ? ` (${d.details.map((x) => `${x.path || "field"}: ${x.message}`).join(", ")})` : "";
    throw new ClientError((d?.error ?? `Request failed (${res.status})`) + detail, res.status, d?.details);
  }
  return data as T;
}

/** Fire-and-forget log of a duty toggle or location-permission change, for the manager's tracking report. */
export function reportLocationStatus(type: "ON_DUTY" | "OFF_DUTY" | "PERMISSION_GRANTED" | "PERMISSION_DENIED") {
  api("/api/tracking/status", { body: { type, deviceTime: new Date().toISOString() } }).catch(() => {});
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number;
  deviceTime: string;
}

/** High-accuracy GPS fix. Waits for a reading ≤ targetAccuracy or returns the best within the timeout. */
export function getGpsFix(targetAccuracy = 30, timeoutMs = 20000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("This device does not support GPS location."));
    let best: GeolocationPosition | null = null;
    const done = (p: GeolocationPosition) => {
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), deviceTime: new Date().toISOString() });
    };
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (p.coords.accuracy <= targetAccuracy) done(p);
      },
      (err) => {
        navigator.geolocation.clearWatch(watch);
        clearTimeout(timer);
        if (err.code === err.PERMISSION_DENIED) reportLocationStatus("PERMISSION_DENIED");
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Enable location for this site to continue."
              : err.code === err.TIMEOUT
                ? "Could not get a GPS fix. Move to an open area and retry."
                : "Location unavailable. Turn on GPS and retry.",
          ),
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    const timer = setTimeout(() => {
      navigator.geolocation.clearWatch(watch);
      if (best) done(best);
      else reject(new Error("Could not get a GPS fix in time. Move to an open area and retry."));
    }, timeoutMs);
  });
}
