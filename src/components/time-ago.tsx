"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";

/**
 * Relative time ("5 minutes ago") that is safe to server-render: the server and browser compute it a
 * few seconds apart, so the text may legitimately differ — hydration tolerates that here only — and it
 * keeps itself fresh every minute.
 */
export function TimeAgo({ date, suffix = true, strict = false, className }: { date: Date | string; suffix?: boolean; strict?: boolean; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const d = new Date(date);
  const text = strict ? formatDistanceToNowStrict(d, { addSuffix: suffix }) : formatDistanceToNow(d, { addSuffix: suffix });
  return (
    <time dateTime={d.toISOString()} title={format(d, "d MMM yyyy, h:mm a")} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
