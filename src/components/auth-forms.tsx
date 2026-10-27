"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Field } from "./ui";
import { api } from "@/lib/client";

/** A stable per-browser id, used only to tag PIN logins for the "last signed in from" audit trail. */
function deviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let id = localStorage.getItem("zs_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("zs_device_id", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function LoginForm({ showDemo = false }: { showDemo?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [usePin, setUsePin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "inactive" ? "Your account is deactivated." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = usePin
        ? await api<{ home: string }>("/api/auth/pin-login", { body: { email, pin, deviceId: deviceId() } })
        : await api<{ home: string }>("/api/auth/login", { body: { email, password } });
      const next = params.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : r.home);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Work email">
        <input className="input h-11" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      </Field>
      {usePin ? (
        <Field label="PIN">
          <input
            className="input h-11 tracking-[0.3em]"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            pattern="\d{4,6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
        </Field>
      ) : (
        <Field label="Password">
          <input className="input h-11" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button variant="primary" size="lg" className="w-full" loading={loading}>
        Sign in
      </Button>
      <button
        type="button"
        onClick={() => {
          setUsePin((v) => !v);
          setError(null);
        }}
        className="block w-full text-center text-xs font-medium text-slate-500 hover:text-sun-700"
      >
        {usePin ? "Use your password instead" : "Use a quick PIN instead"}
      </button>
      {showDemo && (
      <div className="rounded-xl border border-dashed border-sun-300 bg-sun-50/60 p-3 text-xs text-slate-600">
        <div className="mb-1.5 font-semibold text-slate-800">Demo workspace</div>
        <div className="grid grid-cols-2 gap-1">
          {[
            ["Owner", "owner@zeedra.demo"],
            ["Sales manager", "manager@zeedra.demo"],
            ["Tele-caller", "telecaller@zeedra.demo"],
            ["Field sales", "field@zeedra.demo"],
          ].map(([role, mail]) => (
            <button
              type="button"
              key={mail}
              onClick={() => {
                setEmail(mail);
                setPassword("Demo@12345");
              }}
              className="rounded-md bg-white px-2 py-1.5 text-left hover:ring-1 hover:ring-sun-400"
            >
              <div className="font-medium text-slate-700">{role}</div>
              <div className="truncate text-[10px] text-slate-400">{mail}</div>
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500">Password: Demo@12345</div>
      </div>
      )}
      <p className="text-center text-sm text-slate-500">
        New installer?{" "}
        <Link href="/register" className="font-semibold text-sun-700 hover:underline">
          Start free
        </Link>
      </p>
    </form>
  );
}

const STATES = ["Andhra Pradesh", "Delhi", "Gujarat", "Haryana", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal", "Other"];

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ orgName: "", name: "", email: "", phone: "", password: "", state: "Tamil Nadu" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ home: string }>("/api/auth/register", { body: form });
      router.push(r.home);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Field label="Company name">
        <input className="input h-10" required value={form.orgName} onChange={set("orgName")} placeholder="e.g. Sunrise Solar Energy" />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Your name">
          <input className="input h-10" required value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Mobile">
          <input className="input h-10" required value={form.phone} onChange={set("phone")} placeholder="98765 43210" inputMode="tel" />
        </Field>
      </div>
      <Field label="Work email">
        <input className="input h-10" type="email" required value={form.email} onChange={set("email")} />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Password" hint="8+ characters with a number">
          <input className="input h-10" type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Field label="Primary state">
          <select className="input h-10" value={form.state} onChange={set("state")}>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button variant="primary" size="lg" className="w-full" loading={loading}>
        Create workspace
      </Button>
      <p className="text-center text-xs text-slate-500">
        Includes WhatsApp templates, automation playbook and PM Surya Ghar pricing — ready on day one.
      </p>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-sun-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
