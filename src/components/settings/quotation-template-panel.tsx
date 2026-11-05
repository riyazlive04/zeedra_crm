"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, FileUp, Loader2, Trash2, Eye, Code2, Info } from "lucide-react";
import { Card, CardHeader, Button } from "@/components/ui";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { CustomQuotation } from "@/components/quotes/custom-quotation";
import { ITEM_FIELDS, PAYMENT_FIELDS, TEMPLATE_FIELDS, renderQuoteTemplate, sampleContext, sanitizeTemplate, unknownPlaceholders } from "@/lib/quote-template";

export interface TemplateRow {
  id: string;
  name: string;
  active: boolean;
  sourceFileName: string | null;
  html: string;
  updatedAt: string;
}

/** Settings → Quotation template: use the built-in design, or upload your own PDF quotation. */
export function QuotationTemplatePanel({ initial, aiReady }: { initial: TemplateRow[]; aiReady: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.find((t) => t.active)?.id ?? initial[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"preview" | "html">("preview");
  const [draft, setDraft] = useState<string | null>(null);
  const active = list.find((t) => t.active) ?? null;
  const selected = list.find((t) => t.id === selectedId) ?? null;
  const html = draft ?? selected?.html ?? "";
  const preview = useMemo(() => (html ? sanitizeTemplate(renderQuoteTemplate(html, sampleContext())) : ""), [html]);
  const unknown = useMemo(() => (html ? unknownPlaceholders(html) : []), [html]);

  const replace = (t: TemplateRow) => setList((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : t.active ? { ...x, active: false } : x)) : [t, ...l]));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const t = await api<TemplateRow>("/api/quotation-templates", { form });
      replace(t);
      setSelectedId(t.id);
      setDraft(null);
      setView("preview");
      toast.success("Your quotation has been converted", "Check the preview below, then switch it on.");
    } catch (e) {
      toast.error("Couldn't convert the PDF", (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const t = await api<TemplateRow>(`/api/quotation-templates/${id}`, { method: "PATCH", body });
      replace(t);
      if (body.active === true) setList((l) => l.map((x) => ({ ...x, active: x.id === t.id })));
      setDraft(null);
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useBuiltIn = async () => {
    if (!active) return;
    await patch(active.id, { active: false }, "New quotations will use the built-in design");
    setList((l) => l.map((x) => ({ ...x, active: false })));
  };

  const remove = async (t: TemplateRow) => {
    if (!confirm(`Delete the template "${t.name}"? Quotations made with it will show the built-in design.`)) return;
    setBusy(true);
    try {
      await api(`/api/quotation-templates/${t.id}`, { method: "DELETE" });
      setList((l) => l.filter((x) => x.id !== t.id));
      if (selectedId === t.id) setSelectedId(null);
      toast.success("Template deleted");
    } catch (e) {
      toast.error("Couldn't delete", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Quotation design" subtitle="Choose how your quotations look to customers." />
        <div className="grid gap-3 p-5 pt-0 md:grid-cols-2">
          <button type="button" onClick={useBuiltIn} disabled={busy} className={clsx("rounded-xl border-2 p-4 text-left", !active ? "border-sun-500 bg-sun-50/60" : "border-slate-200 hover:border-slate-300")}>
            <div className="flex items-center gap-2 font-semibold text-slate-800">{!active && <Check className="h-4 w-4 text-sun-600" />}Built-in design</div>
            <p className="mt-1 text-sm text-slate-500">The standard 4-page Zeedra quotation with your logo, prices and terms from these settings.</p>
          </button>
          <div className={clsx("rounded-xl border-2 p-4", active ? "border-sun-500 bg-sun-50/60" : "border-slate-200")}>
            <div className="flex items-center gap-2 font-semibold text-slate-800">{active && <Check className="h-4 w-4 text-sun-600" />}Our own template</div>
            <p className="mt-1 text-sm text-slate-500">{active ? <>Using <b>{active.name}</b> for new quotations.</> : "Upload the PDF quotation you use today. We'll turn it into a template and fill it for every customer."}</p>
            <label className={clsx("mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white", aiReady && !uploading ? "sun-gradient" : "cursor-not-allowed bg-slate-300")}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? "Converting… (about a minute)" : "Upload PDF quotation"}
              <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={!aiReady || uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </label>
            {!aiReady && <p className="mt-2 text-xs text-amber-700">PDF conversion needs the AI service. Ask your administrator to add ANTHROPIC_API_KEY.</p>}
          </div>
        </div>
      </Card>

      {list.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <select value={selectedId ?? ""} onChange={(e) => { setSelectedId(e.target.value); setDraft(null); }} className="input h-9 w-auto py-0 text-sm">
              {list.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? " (in use)" : ""}</option>)}
            </select>
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
              <button type="button" onClick={() => setView("preview")} className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1", view === "preview" ? "bg-slate-900 text-white" : "text-slate-600")}><Eye className="h-3.5 w-3.5" /> Preview</button>
              <button type="button" onClick={() => setView("html")} className={clsx("flex items-center gap-1 rounded-md px-2.5 py-1", view === "html" ? "bg-slate-900 text-white" : "text-slate-600")}><Code2 className="h-3.5 w-3.5" /> Edit HTML</button>
            </div>
            {selected && (
              <div className="ml-auto flex items-center gap-2">
                {draft !== null && <Button size="sm" onClick={() => patch(selected.id, { html: draft }, "Template saved")} loading={busy}>Save changes</Button>}
                {!selected.active ? (
                  <Button size="sm" variant="primary" loading={busy} onClick={() => patch(selected.id, { active: true, ...(draft !== null ? { html: draft } : {}) }, "Switched on. New quotations will use this template")}>
                    <Check className="h-4 w-4" /> Use for new quotations
                  </Button>
                ) : (
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">In use</span>
                )}
                <button type="button" onClick={() => remove(selected)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete template"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </div>
          {unknown.length > 0 && (
            <div className="flex gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> These placeholders aren&apos;t recognised and will show as blank: {unknown.map((u) => `{{${u}}}`).join(", ")}
            </div>
          )}
          <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0 bg-slate-100 p-4">
              {view === "preview" ? (
                <>
                  <p className="mb-2 text-xs text-slate-500">Preview with sample customer data. Real quotations fill in your customer&apos;s details and prices.</p>
                  <CustomQuotation html={preview} showPrint={false} />
                </>
              ) : (
                <textarea
                  value={html}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800"
                />
              )}
            </div>
            <aside className="max-h-[80vh] overflow-y-auto border-l border-slate-100 p-4 text-xs">
              <h4 className="mb-1 font-semibold text-slate-800">Placeholders</h4>
              <p className="mb-2 text-slate-500">Put these anywhere in the HTML. They&apos;re filled from each quotation.</p>
              <ul className="space-y-1">
                {TEMPLATE_FIELDS.map((f) => (
                  <li key={f.key}><code className="rounded bg-slate-100 px-1 text-[11px] text-slate-700">{`{{${f.key}}}`}</code> <span className="text-slate-500">{f.label}</span></li>
                ))}
              </ul>
              <h4 className="mb-1 mt-4 font-semibold text-slate-800">Line items</h4>
              <code className="block whitespace-pre rounded bg-slate-100 p-2 text-[11px] text-slate-700">{"{{#each items}}\n  <tr><td>{{no}}</td><td>{{content}}</td>…</tr>\n{{/each}}"}</code>
              <p className="mt-1 text-slate-500">{ITEM_FIELDS.map((f) => `{{${f.key}}}`).join(" ")}</p>
              <h4 className="mb-1 mt-4 font-semibold text-slate-800">Payment schedule</h4>
              <p className="text-slate-500">{"{{#each payments}} … {{/each}}"} with {PAYMENT_FIELDS.map((f) => `{{${f}}}`).join(" ")}</p>
              <h4 className="mb-1 mt-4 font-semibold text-slate-800">Show only if present</h4>
              <p className="text-slate-500">{"{{#if company.logoUrl}} … {{/if}}"}</p>
            </aside>
          </div>
        </Card>
      )}
      <p className="text-xs text-slate-500">Quotations remember the design they were made with, so switching templates only changes new quotations.</p>
    </div>
  );
}
