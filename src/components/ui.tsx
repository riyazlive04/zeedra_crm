import Link from "next/link";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { initials } from "@/lib/text";

export { clsx as cn };

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "sun-gradient text-white shadow-sm hover:brightness-105 active:brightness-95 border border-orange-500/30",
  secondary: "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
  dark: "bg-ink-900 text-white hover:bg-ink-800 shadow-sm",
};
const SIZE: Record<Size, string> = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return clsx(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={clsx("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sun-50 text-sun-600">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export type Tone = "slate" | "green" | "red" | "amber" | "blue" | "violet" | "orange" | "sky" | "rose" | "emerald";
const TONE: Record<Tone, string> = {
  slate: "bg-slate-50 text-slate-700 border-slate-200",
  green: "bg-green-50 text-green-700 border-green-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-red-50 text-red-700 border-red-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};

export function Badge({ tone = "slate", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx("chip", TONE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string | null; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      style={{ width: size, height: size, background: color ?? "#64748b", fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-sun-600">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "amber",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "amber" | "green" | "red" | "blue" | "violet" | "slate";
  href?: string;
}) {
  const ring: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-600",
    blue: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const inner = (
    <div className="card h-full p-4 transition hover:shadow-pop">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", ring[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sun-50 text-sun-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

/** Instant pending UI for a route's loading.tsx, so navigation never shows a blank page while the server fetches data. */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "stats" | "board" | "cards" }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {variant === "stats" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Skeleton className="h-72 rounded-xl xl:col-span-2" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </>
      )}

      {variant === "table" && (
        <div className="card overflow-hidden p-4">
          <Skeleton className="mb-4 h-9 w-full max-w-sm rounded-lg" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      )}

      {variant === "board" && (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[28rem] rounded-xl" />
          ))}
        </div>
      )}

      {variant === "cards" && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, tone = "sun" }: { value: number; tone?: "sun" | "green" | "red" }) {
  const c = tone === "green" ? "bg-emerald-500" : tone === "red" ? "bg-rose-500" : "sun-gradient";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={clsx("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
