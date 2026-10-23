"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X, Upload, Download } from "lucide-react";
import { Button } from "../ui";
import { Modal } from "../modal";
import { STAGE_LABEL } from "../badges";
import { humanize } from "@/lib/text";
import { SOURCES, SEGMENTS, STAGES } from "@/lib/validators";
import { api } from "@/lib/client";
import { useToast } from "../toast";

export function LeadFilters({ users, canImport, canExport }: { users: { id: string; name: string }[]; canImport: boolean; canExport: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const [importOpen, setImportOpen] = useState(false);

  function setParam(key: string, value: string | null) {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    start(() => router.push(`${pathname}?${p.toString()}`));
  }

  const select = (key: string, label: string, options: [string, string][]) => (
    <select value={params.get(key) ?? ""} onChange={(e) => setParam(key, e.target.value || null)} className="input h-9 w-auto min-w-[8.5rem] py-1.5 text-xs" aria-label={label}>
      <option value="">{label}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  const active = ["stage", "temperature", "source", "segment", "assignedToId", "open", "followUpDue", "q"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
      <form
        className="relative min-w-[14rem] flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q.trim() || null);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, code, area…" className="input h-9 pl-9 text-sm" />
      </form>
      {select("temperature", "Temperature", [["HOT", "🔥 Hot"], ["WARM", "☀️ Warm"], ["COLD", "❄️ Cold"]])}
      {select("stage", "Stage", STAGES.map((s) => [s, STAGE_LABEL[s]]))}
      {select("source", "Source", SOURCES.map((s) => [s, humanize(s)]))}
      {select("segment", "Segment", SEGMENTS.map((s) => [s, humanize(s)]))}
      {users.length > 0 && select("assignedToId", "Owner", [["none", "Unassigned"], ...users.map((u) => [u.id, u.name] as [string, string])])}
      {select("sort", "Sort: newest", [["score", "Highest score"], ["followup", "Follow-up due"], ["bill", "Biggest bill"]])}
      <label className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600">
        <input type="checkbox" checked={params.get("open") === "1"} onChange={(e) => setParam("open", e.target.checked ? "1" : null)} className="accent-amber-500" />
        Open only
      </label>
      {active && (
        <Button size="sm" variant="ghost" onClick={() => start(() => router.push(pathname))}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      )}
      {pending && <span className="text-xs text-slate-400">Loading…</span>}
      <div className="ml-auto flex gap-2">
        {canImport && (
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
        )}
        {canExport && (
          <a href={`/api/leads/export?${params.toString()}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Export
          </a>
        )}
      </div>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => router.refresh()} />
    </div>
  );
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("FACEBOOK");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; duplicates: number; failed: number; errors: { row: number; error: string }[] } | null>(null);
  const toast = useToast();

  async function upload() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("source", source);
    try {
      const r = await api<typeof result & object>("/api/leads/import", { form });
      setResult(r);
      toast.success(`Imported ${r.created} leads`, `${r.duplicates} duplicates merged, ${r.failed} failed`);
      onDone();
    } catch (e) {
      toast.error("Import failed", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setResult(null);
        setFile(null);
        onClose();
      }}
      title="Import leads from CSV"
      subtitle="Facebook Lead Ads, IndiaMART, JustDial, Excel exports — headers are matched automatically."
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={upload} loading={loading} disabled={!file}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Required columns: <b>name</b>, <b>phone</b>. Optional: email, city, address, pincode, source, campaign, segment, monthly bill, units, own house (yes/no).
          Duplicates (same phone) are merged into the existing lead. Every new lead is scored, assigned and welcomed on WhatsApp by your automations.
        </div>
        <label className="block">
          <span className="label">CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sun-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sun-700" />
        </label>
        <label className="block">
          <span className="label">Default source (when the file has no source column)</span>
          <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </label>
        {result && (
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div>
              ✅ {result.created} created · 🔁 {result.duplicates} duplicates · ⚠ {result.failed} failed
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-rose-600">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
