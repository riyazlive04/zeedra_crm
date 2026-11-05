"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, KeyRound, Plus, Ban, CheckCircle2, CalendarPlus } from "lucide-react";
import { Button, Card, CardHeader, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("") + "@1";
}

/** Create a client company with its owner. */
export function NewClientButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ orgName: "", ownerName: "", email: "", phone: "", password: randomPassword(), plan: "GROWTH", billingStatus: "TRIALING", trialDays: 14 });
  const [done, setDone] = useState<{ email: string; password: string; id: string } | null>(null);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string; ownerEmail: string }>("/api/platform/orgs", { body: { ...f, phone: f.phone || null } });
      setDone({ email: r.ownerEmail, password: f.password, id: r.id });
      router.refresh();
    } catch (e) {
      toast.error("Couldn't create the client", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setOpen(false);
    setDone(null);
    setF({ orgName: "", ownerName: "", email: "", phone: "", password: randomPassword(), plan: "GROWTH", billingStatus: "TRIALING", trialDays: 14 });
  };
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New client</Button>
      <Modal
        open={open}
        onClose={close}
        title={done ? "Client created" : "New client"}
        subtitle={done ? "Send these sign-in details to the owner. They can change the password in their profile." : "Creates the company, its owner account, WhatsApp templates and starter automations."}
        footer={done ? (
          <>
            <Button onClick={() => navigator.clipboard.writeText(`Sign in at ${window.location.origin}/login\nEmail: ${done.email}\nPassword: ${done.password}`).then(() => toast.success("Copied"))}>Copy sign-in details</Button>
            <Button variant="primary" onClick={() => { router.push(`/platform/${done.id}`); close(); }}>Open client</Button>
          </>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={create}>Create client</Button>
          </>
        )}
      >
        {done ? (
          <div className="space-y-2 rounded-xl bg-slate-50 p-4 font-mono text-sm">
            <div>Sign in: {typeof window !== "undefined" ? window.location.origin : ""}/login</div>
            <div>Email: {done.email}</div>
            <div>Password: {done.password}</div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name"><input className="input" value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} placeholder="e.g. Sunrise Solar Pvt Ltd" /></Field>
            <Field label="Owner's name"><input className="input" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></Field>
            <Field label="Owner's email (their sign-in)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Owner's mobile"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Temporary password" hint="Pre-filled with a strong random one">
              <div className="flex gap-2"><input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><Button size="sm" onClick={() => setF({ ...f, password: randomPassword() })}>New</Button></div>
            </Field>
            <Field label="Plan">
              <select className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="STARTER">Starter</option><option value="GROWTH">Growth</option><option value="SCALE">Scale</option></select>
            </Field>
            <Field label="Start as">
              <select className="input" value={f.billingStatus} onChange={(e) => setF({ ...f, billingStatus: e.target.value })}><option value="TRIALING">Free trial</option><option value="ACTIVE">Paying customer</option></select>
            </Field>
            {f.billingStatus === "TRIALING" && (
              <Field label="Trial length (days)"><input className="input" type="number" min={1} max={365} value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: Number(e.target.value) || 14 })} /></Field>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

interface OrgInfo {
  id: string;
  name: string;
  plan: string;
  billingStatus: string;
  trialEndsAt: string | null;
  suspended: boolean;
  isOwnCompany: boolean;
  ownerEmail: string | null;
  whatsappConnected: boolean;
}

/** Right-hand panel on a client's page: plan, billing, trial, suspension, owner password, View as. */
export function ClientActions({ org, plans, planName, subscribedAt }: { org: OrgInfo; plans: { id: string; name: string; seatLimit: number | null }[]; planName: string; subscribedAt: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState(randomPassword());

  const patch = async (key: string, body: Record<string, unknown>, msg: string) => {
    setBusy(key);
    try {
      await api(`/api/platform/orgs/${org.id}`, { method: "PATCH", body });
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const viewAs = async () => {
    if (!confirm(`View ${org.name}'s workspace as their owner? You'll see exactly what they see for up to 2 hours. This is recorded in their audit log.`)) return;
    setBusy("view");
    try {
      const r = await api<{ home: string }>("/api/platform/impersonate", { body: { orgId: org.id } });
      window.location.href = r.home;
    } catch (e) {
      toast.error("Couldn't open their workspace", (e as Error).message);
      setBusy(null);
    }
  };

  const resetPw = async () => {
    setBusy("pw");
    try {
      const r = await api<{ email: string }>(`/api/platform/orgs/${org.id}/owner-password`, { body: { password: pw } });
      await navigator.clipboard.writeText(`Email: ${r.email}\nNew password: ${pw}`).catch(() => {});
      toast.success("Password changed", "The new sign-in details are copied to your clipboard.");
      setPwOpen(false);
    } catch (e) {
      toast.error("Couldn't change the password", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const trialLeft = org.trialEndsAt ? Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Support" />
        <div className="space-y-2 px-5 pb-5">
          <Button variant="primary" className="w-full" loading={busy === "view"} disabled={!org.ownerEmail || org.isOwnCompany} onClick={viewAs}><Eye className="h-4 w-4" /> View as {org.name}</Button>
          <Button className="w-full" disabled={!org.ownerEmail} onClick={() => { setPw(randomPassword()); setPwOpen(true); }}><KeyRound className="h-4 w-4" /> Reset owner&apos;s password</Button>
          <p className="text-xs text-slate-500">Owner: {org.ownerEmail ?? "none"} · WhatsApp {org.whatsappConnected ? "connected" : "not connected"}</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Plan & billing" subtitle={`${planName}${org.billingStatus === "ACTIVE" ? ` · paying since ${subscribedAt}` : ""}`} />
        <div className="space-y-3 px-5 pb-5 text-sm">
          <Field label="Plan">
            <select className="input" defaultValue={org.plan} disabled={!!busy} onChange={(e) => patch("plan", { plan: e.target.value }, "Plan changed")}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.seatLimit ? ` (up to ${p.seatLimit} users)` : " (unlimited users)"}</option>)}
            </select>
          </Field>
          <Field label="Billing status">
            <select className="input" defaultValue={org.billingStatus} disabled={!!busy} onChange={(e) => patch("status", { billingStatus: e.target.value }, "Billing status changed")}>
              <option value="TRIALING">Free trial</option>
              <option value="ACTIVE">Paying</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </Field>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="mb-2 text-xs text-slate-600">
              {trialLeft == null ? "No trial end date." : trialLeft > 0 ? `Trial ends in ${trialLeft} day${trialLeft === 1 ? "" : "s"}.` : `Trial ended ${-trialLeft} day${trialLeft === -1 ? "" : "s"} ago.`}
            </div>
            <div className="flex gap-2">
              {[7, 14, 30].map((d) => (
                <Button key={d} size="sm" loading={busy === `t${d}`} onClick={() => patch(`t${d}`, { extendTrialDays: d }, `Trial extended by ${d} days`)}><CalendarPlus className="h-3.5 w-3.5" /> +{d}d</Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Access" />
        <div className="px-5 pb-5">
          {org.suspended ? (
            <Button className="w-full" loading={busy === "susp"} onClick={() => patch("susp", { suspended: false }, "Reactivated. They can sign in again")}><CheckCircle2 className="h-4 w-4 text-green-600" /> Reactivate company</Button>
          ) : (
            <Button
              variant="danger"
              className="w-full"
              disabled={org.isOwnCompany}
              loading={busy === "susp"}
              onClick={() => {
                const reason = prompt(`Suspend ${org.name}? Everyone in this company will be signed out and can't sign in until you reactivate them.\n\nReason (optional, shown here only):`);
                if (reason !== null) patch("susp", { suspended: true, suspendedReason: reason || null }, "Company suspended");
              }}
            >
              <Ban className="h-4 w-4" /> Suspend company
            </Button>
          )}
          {org.isOwnCompany && <p className="mt-2 text-xs text-slate-500">This is your own company, so View as and Suspend are turned off.</p>}
        </div>
      </Card>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Reset owner's password"
        subtitle={`Sets a new password for ${org.ownerEmail}. Their current password stops working.`}
        footer={<><Button onClick={() => setPwOpen(false)}>Cancel</Button><Button variant="primary" loading={busy === "pw"} onClick={resetPw}>Set password & copy</Button></>}
      >
        <Field label="New password"><div className="flex gap-2"><input className="input font-mono" value={pw} onChange={(e) => setPw(e.target.value)} /><Button size="sm" onClick={() => setPw(randomPassword())}>New</Button></div></Field>
      </Modal>
    </div>
  );
}
