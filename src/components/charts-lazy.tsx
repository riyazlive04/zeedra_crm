"use client";

import dynamic from "next/dynamic";

// The charting library is large; load it after the page so KPIs and lists show first.
const placeholder = (h: number) => () => <div className="w-full animate-pulse rounded-lg bg-slate-100" style={{ height: h }} />;

export const LeadTrendChart = dynamic(() => import("./charts").then((m) => m.LeadTrendChart), { ssr: false, loading: placeholder(220) });
export const HBarChart = dynamic(() => import("./charts").then((m) => m.HBarChart), { ssr: false, loading: placeholder(240) });
