import { Flame, Snowflake, Sun, ShieldCheck, ShieldAlert, ShieldQuestion, Building2, MapPinOff, Clock, Gauge, Navigation } from "lucide-react";
import { Badge, type Tone } from "./ui";
import { humanize } from "@/lib/text";

export function TemperatureBadge({ value, score }: { value: string; score?: number | null }) {
  const map: Record<string, { tone: Tone; icon: React.ReactNode }> = {
    HOT: { tone: "red", icon: <Flame className="h-3 w-3" /> },
    WARM: { tone: "amber", icon: <Sun className="h-3 w-3" /> },
    COLD: { tone: "sky", icon: <Snowflake className="h-3 w-3" /> },
  };
  const m = map[value] ?? map.COLD;
  return (
    <Badge tone={m.tone}>
      {m.icon}
      {humanize(value)}
      {score != null && <span className="opacity-60">· {score}</span>}
    </Badge>
  );
}

export const STAGE_TONE: Record<string, Tone> = {
  NEW: "slate",
  CONTACTED: "blue",
  QUALIFIED: "violet",
  SITE_VISIT_SCHEDULED: "sky",
  SITE_VISIT_DONE: "sky",
  QUOTATION_SENT: "amber",
  NEGOTIATION: "orange",
  WON: "green",
  LOST: "rose",
  DISQUALIFIED: "slate",
};

export const STAGE_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  SITE_VISIT_SCHEDULED: "Visit scheduled",
  SITE_VISIT_DONE: "Visit done",
  QUOTATION_SENT: "Quotation sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
  DISQUALIFIED: "Disqualified",
};

export function StageBadge({ value }: { value: string }) {
  return (
    <Badge tone={STAGE_TONE[value] ?? "slate"} dot>
      {STAGE_LABEL[value] ?? humanize(value)}
    </Badge>
  );
}

export const VERDICT_META: Record<string, { tone: Tone; label: string; icon: React.ReactNode; help: string }> = {
  VERIFIED: { tone: "green", label: "GPS verified", icon: <ShieldCheck className="h-3 w-3" />, help: "Created at the customer site during the scheduled slot." },
  OUT_OF_RANGE: { tone: "red", label: "Away from site", icon: <MapPinOff className="h-3 w-3" />, help: "Captured outside the site geofence." },
  LOW_ACCURACY: { tone: "amber", label: "Weak GPS", icon: <Gauge className="h-3 w-3" />, help: "GPS accuracy was too low to confirm the location." },
  TIME_MISMATCH: { tone: "orange", label: "Outside slot", icon: <Clock className="h-3 w-3" />, help: "Captured outside the appointment time window." },
  CLOCK_TAMPER: { tone: "red", label: "Clock mismatch", icon: <ShieldAlert className="h-3 w-3" />, help: "Device clock differs from server time — possible manipulation." },
  IMPOSSIBLE_TRAVEL: { tone: "red", label: "Impossible travel", icon: <Navigation className="h-3 w-3" />, help: "Moved faster than physically possible — possible mock location." },
  SITE_UNPINNED: { tone: "violet", label: "Site not pinned", icon: <ShieldQuestion className="h-3 w-3" />, help: "Customer site location is not confirmed yet." },
  NO_GPS: { tone: "red", label: "No GPS", icon: <MapPinOff className="h-3 w-3" />, help: "No location was captured." },
  OFFICE_CREATED: { tone: "slate", label: "Office quote", icon: <Building2 className="h-3 w-3" />, help: "Created from the office by a manager." },
};

export function VerdictBadge({ value }: { value: string }) {
  const m = VERDICT_META[value] ?? VERDICT_META.NO_GPS;
  return (
    <span title={m.help}>
      <Badge tone={m.tone}>
        {m.icon}
        {m.label}
      </Badge>
    </span>
  );
}
