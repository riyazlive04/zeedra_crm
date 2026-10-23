"use client";

import clsx from "clsx";

/** Yes / No / (unknown) segmented control for qualification booleans. */
export function YesNo({ value, onChange, yes = "Yes", no = "No" }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void; yes?: string; no?: string }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {[
        [true, yes],
        [false, no],
      ].map(([v, label]) => (
        <button
          type="button"
          key={String(v)}
          onClick={() => onChange(value === v ? null : (v as boolean))}
          className={clsx(
            "rounded-md px-3 py-1 text-xs font-medium transition",
            value === v ? (v ? "bg-emerald-500 text-white shadow-sm" : "bg-rose-500 text-white shadow-sm") : "text-slate-600 hover:text-slate-900",
          )}
        >
          {label as string}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T | null | undefined; onChange: (v: T | null) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={clsx(
            "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
            value === o.value ? "border-sun-500 bg-sun-50 text-sun-800 ring-1 ring-sun-500/30" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder, suffix, prefix, min = 0 }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; suffix?: string; prefix?: string; min?: number }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        className={clsx("input", prefix && "pl-7", suffix && "pr-14")}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}
