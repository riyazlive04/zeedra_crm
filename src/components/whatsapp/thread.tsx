"use client";

import { useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Send, Sparkles, Check, CheckCheck, AlertCircle, Bot, FileText, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui";
import { api } from "@/lib/client";
import { useToast } from "../toast";

export interface WaMessage {
  id: string;
  direction: string;
  body: string;
  status: string;
  automated: boolean;
  templateKey: string | null;
  error: string | null;
  createdAt: string | Date;
}

function StatusIcon({ s }: { s: string }) {
  if (s === "READ") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (s === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5 text-slate-400" />;
  if (s === "SENT" || s === "SIMULATED") return <Check className="h-3.5 w-3.5 text-slate-400" />;
  if (s === "FAILED") return <AlertCircle className="h-3.5 w-3.5 text-rose-500" />;
  return null;
}

export function WhatsAppThread({
  leadId,
  initial,
  templates,
  height = 460,
  canSend = true,
}: {
  leadId: string;
  initial?: WaMessage[];
  templates: { key: string; name: string }[];
  height?: number | string;
  canSend?: boolean;
}) {
  const [messages, setMessages] = useState<WaMessage[]>(initial ?? []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [simLink, setSimLink] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  async function reload() {
    const r = await api<WaMessage[]>(`/api/leads/${leadId}/messages`).catch(() => null);
    if (r) setMessages(r);
  }

  useEffect(() => {
    if (!initial) reload();
    api("/api/whatsapp", { body: { action: "markRead", leadId } }).catch(() => {});
    const t = setInterval(reload, 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages.length]);

  async function send(payload: { body?: string; templateKey?: string }) {
    setSending(true);
    try {
      const r = await api<{ status: string; error?: string; waLink: string }>("/api/whatsapp", { body: { action: "send", leadId, ...payload } });
      if (r.status === "FAILED") toast.error("WhatsApp failed", r.error);
      else if (r.status === "SIMULATED") {
        setSimLink(r.waLink);
        toast.info("Logged (WhatsApp API not connected)", "Use 'Open in WhatsApp' to send from your phone, or connect the Cloud API in Settings.");
      }
      setText("");
      await reload();
    } catch (e) {
      toast.error("Send failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function draft() {
    setDrafting(true);
    try {
      const r = await api<{ draft: string; source: string }>("/api/whatsapp", { body: { action: "draft", leadId } });
      setText(r.draft);
    } catch (e) {
      toast.error("Could not draft reply", e instanceof Error ? e.message : undefined);
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <div
        className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
        style={{ backgroundColor: "#efeae2", backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
      >
        {messages.length === 0 && <div className="mx-auto mt-10 w-fit rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-500">No messages yet — start the conversation.</div>}
        {messages.map((m, i) => {
          const d = new Date(m.createdAt);
          const prev = messages[i - 1];
          const showDay = !prev || !isSameDay(new Date(prev.createdAt), d);
          const out = m.direction === "OUT";
          return (
            <div key={m.id}>
              {showDay && <div className="mx-auto my-2 w-fit rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-slate-500 shadow-sm">{format(d, "d MMM yyyy")}</div>}
              <div className={clsx("flex", out ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[82%] rounded-lg px-3 py-1.5 text-[13px] leading-snug shadow-sm", out ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white")}>
                  {(m.automated || m.templateKey) && (
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                      {m.automated ? <Bot className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      {m.automated ? "Automation" : "Template"}
                      {m.templateKey && ` · ${m.templateKey}`}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words text-slate-800">{m.body}</div>
                  {m.error && <div className="mt-1 text-[11px] text-rose-600">{m.error}</div>}
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    {format(d, "h:mm a")}
                    {out && <StatusIcon s={m.status} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {canSend && (
        <div className="space-y-2 border-t border-slate-200 bg-white p-2.5">
          {simLink && (
            <a href={simLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
              <ExternalLink className="h-3.5 w-3.5" /> Open last message in WhatsApp
            </a>
          )}
          <div className="flex gap-2">
            <select
              className="input h-8 w-auto max-w-[12rem] py-0 text-xs"
              value=""
              onChange={(e) => e.target.value && send({ templateKey: e.target.value })}
              disabled={sending}
              aria-label="Send template"
            >
              <option value="">Send template…</option>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={draft} loading={drafting} className="text-violet-700 hover:bg-violet-50">
              {!drafting && <Sparkles className="h-3.5 w-3.5" />} AI reply
            </Button>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send({ body: text.trim() });
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (text.trim()) send({ body: text.trim() });
                }
              }}
              rows={Math.min(5, Math.max(1, text.split("\n").length))}
              placeholder="Type a message"
              className="input resize-none"
            />
            <button type="submit" disabled={sending || !text.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40" aria-label="Send">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
