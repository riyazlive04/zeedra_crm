import type { OrgSettings } from "./settings";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export type Verdict =
  | "VERIFIED"
  | "OUT_OF_RANGE"
  | "LOW_ACCURACY"
  | "TIME_MISMATCH"
  | "CLOCK_TAMPER"
  | "IMPOSSIBLE_TRAVEL"
  | "SITE_UNPINNED"
  | "NO_GPS";

export interface FieldCapture {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  deviceTime?: Date | null;
}

export interface ValidationInput {
  capture: FieldCapture | null;
  serverTime: Date;
  site: (LatLng & { pinned?: boolean }) | null;
  appointment?: { startAt: Date; endAt: Date } | null;
  lastPing?: (LatLng & { at: Date }) | null;
}

export interface Check {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ValidationResult {
  verdict: Verdict;
  flags: Verdict[];
  distanceM: number | null;
  checks: Check[];
}

// Most severe first — the verdict is the first failing check in this order.
const SEVERITY: Verdict[] = [
  "NO_GPS",
  "CLOCK_TAMPER",
  "IMPOSSIBLE_TRAVEL",
  "OUT_OF_RANGE",
  "LOW_ACCURACY",
  "TIME_MISMATCH",
  "SITE_UNPINNED",
];

/**
 * Validates that a field action (check-in or quotation) happened at the customer's site, at the
 * scheduled time, from an honest device. Server time is authoritative; the device clock is only
 * compared against it to catch manipulated timestamps or offline back-dating.
 */
export function validateFieldCapture(input: ValidationInput, s: OrgSettings): ValidationResult {
  const checks: Check[] = [];
  const flags: Verdict[] = [];
  const fail = (v: Verdict) => !flags.includes(v) && flags.push(v);
  const { capture, serverTime, site } = input;

  if (!capture || !isValidCoord(capture.lat, capture.lng)) {
    checks.push({ key: "gps", label: "GPS fix", passed: false, detail: "No location received from device." });
    return { verdict: "NO_GPS", flags: ["NO_GPS"], distanceM: null, checks };
  }
  checks.push({ key: "gps", label: "GPS fix", passed: true, detail: `${capture.lat.toFixed(5)}, ${capture.lng.toFixed(5)}` });

  // 1. Accuracy
  const acc = capture.accuracyM ?? null;
  if (acc == null || acc > s.maxGpsAccuracyM) {
    fail("LOW_ACCURACY");
    checks.push({
      key: "accuracy",
      label: "GPS accuracy",
      passed: false,
      detail: acc == null ? "Accuracy not reported." : `±${Math.round(acc)} m exceeds ±${s.maxGpsAccuracyM} m limit.`,
    });
  } else {
    checks.push({ key: "accuracy", label: "GPS accuracy", passed: true, detail: `±${Math.round(acc)} m` });
  }

  // 2. Geofence against the customer site
  let distanceM: number | null = null;
  if (!site || !isValidCoord(site.lat, site.lng)) {
    fail("SITE_UNPINNED");
    checks.push({ key: "geofence", label: "At customer site", passed: false, detail: "Customer site location is not pinned yet." });
  } else {
    distanceM = Math.round(haversineM(capture, site));
    // Allow the reported accuracy to absorb part of the error, but never more than half the radius.
    const tolerance = s.geofenceRadiusM + Math.min(acc ?? 0, s.geofenceRadiusM / 2);
    const ok = distanceM <= tolerance;
    if (!ok) fail("OUT_OF_RANGE");
    checks.push({
      key: "geofence",
      label: "At customer site",
      passed: ok,
      detail: `${formatDistance(distanceM)} from site (limit ${s.geofenceRadiusM} m)`,
    });
    if (site.pinned === false) {
      fail("SITE_UNPINNED");
      checks.push({
        key: "sitePin",
        label: "Site pin confirmed",
        passed: false,
        detail: "Site coordinates came from address geocoding — manager should confirm the pin.",
      });
    }
  }

  // 3. Device clock vs server clock
  if (capture.deviceTime) {
    const driftMin = Math.abs(capture.deviceTime.getTime() - serverTime.getTime()) / 60_000;
    const ok = driftMin <= s.maxClockDriftMin;
    if (!ok) fail("CLOCK_TAMPER");
    checks.push({
      key: "clock",
      label: "Device time matches server",
      passed: ok,
      detail: ok ? `Drift ${driftMin.toFixed(1)} min` : `Device clock off by ${Math.round(driftMin)} min — possible manipulation.`,
    });
  }

  // 4. Appointment time window
  if (input.appointment) {
    const from = input.appointment.startAt.getTime() - s.appointmentWindowBeforeMin * 60_000;
    const to = input.appointment.endAt.getTime() + s.appointmentWindowAfterMin * 60_000;
    const t = serverTime.getTime();
    const ok = t >= from && t <= to;
    if (!ok) fail("TIME_MISMATCH");
    checks.push({
      key: "window",
      label: "Within scheduled slot",
      passed: ok,
      detail: ok ? "Captured during the scheduled appointment window." : "Captured outside the scheduled appointment window.",
    });
  } else if (s.requireAppointmentForQuote) {
    fail("TIME_MISMATCH");
    checks.push({ key: "window", label: "Within scheduled slot", passed: false, detail: "No scheduled appointment for this visit." });
  }

  // 5. Velocity — teleporting between pings indicates mock-location apps
  if (input.lastPing && isValidCoord(input.lastPing.lat, input.lastPing.lng)) {
    const hours = (serverTime.getTime() - input.lastPing.at.getTime()) / 3_600_000;
    const km = haversineM(capture, input.lastPing) / 1000;
    if (hours > 0 && km > 1) {
      const speed = km / hours;
      const ok = speed <= s.maxTravelSpeedKmph;
      if (!ok) fail("IMPOSSIBLE_TRAVEL");
      checks.push({
        key: "velocity",
        label: "Realistic travel",
        passed: ok,
        detail: `${km.toFixed(1)} km since last ping (${Math.round(speed)} km/h)`,
      });
    }
  }

  const verdict = SEVERITY.find((v) => flags.includes(v)) ?? "VERIFIED";
  return { verdict, flags, distanceM, checks };
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
