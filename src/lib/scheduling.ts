/** Timezone-aware slot generation (pure — unit tested). */

/** Offset in minutes of `tz` from UTC at the given instant (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Converts a wall-clock date ("2026-10-22") + time ("09:30") in `tz` to a UTC Date. */
export function zonedDateTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offset * 60_000);
}

/** Day-of-week (0=Sun) of a wall-clock date string. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

export function computeSlots(opts: {
  date: string;
  tz: string;
  workdayStart: string;
  workdayEnd: string;
  slotMinutes: number;
  workdays: number[];
  busy: Interval[];
  now?: Date;
  /** Travel buffer kept free after each booked visit. */
  bufferMinutes?: number;
}): Slot[] {
  if (!opts.workdays.includes(weekday(opts.date))) return [];
  const start = zonedDateTime(opts.date, opts.workdayStart, opts.tz).getTime();
  const end = zonedDateTime(opts.date, opts.workdayEnd, opts.tz).getTime();
  const step = opts.slotMinutes * 60_000;
  const buffer = (opts.bufferMinutes ?? 0) * 60_000;
  const now = (opts.now ?? new Date()).getTime();
  const slots: Slot[] = [];
  for (let t = start; t + step <= end; t += step) {
    const s = t;
    const e = t + step;
    const clash = opts.busy.some((b) => s < b.end.getTime() + buffer && e > b.start.getTime() - buffer);
    slots.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), available: !clash && s > now });
  }
  return slots;
}
