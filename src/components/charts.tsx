"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { format } from "date-fns";

const MARK = "#d97706"; // amber-600 — ≥3:1 against the white card surface
const GRID = "#eef0f3";
const AXIS = { fontSize: 11, fill: "#64748b" };

function Tip({ active, payload, label, unit, labelFormat }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string; unit: string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-pop">
      <div className="font-medium text-slate-500">{labelFormat ? labelFormat(String(label)) : label}</div>
      <div className="mt-0.5 font-semibold text-slate-900">
        {payload[0].value.toLocaleString("en-IN")} {unit}
      </div>
    </div>
  );
}

export function LeadTrendChart({ data }: { data: { date: string; leads: number }[] }) {
  return (
    <div className="h-56" role="img" aria-label={`New leads per day, last 14 days. Total ${data.reduce((a, b) => a + b.leads, 0)}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={MARK} stopOpacity={0.22} />
              <stop offset="1" stopColor={MARK} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => format(new Date(d), "d MMM")} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} content={<Tip unit="leads" labelFormat={(d) => format(new Date(d), "EEE, d MMM")} />} />
          <Area type="monotone" dataKey="leads" stroke={MARK} strokeWidth={2} fill="url(#leadFill)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal single-hue bars with direct value labels (funnel, sources). */
export function HBarChart({ data, unit, height = 240 }: { data: { label: string; value: number }[]; unit: string; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={118} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#f8fafc" }} content={<Tip unit={unit} />} />
          <Bar dataKey="value" fill={MARK} radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
