"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "./ui";
import { api } from "@/lib/client";
import { useToast } from "./toast";

export function AiBrief() {
  const [brief, setBrief] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ brief: string; source: string }>("/api/dashboard/brief", { body: {} });
      setBrief(r.brief);
      setSource(r.source);
    } catch (e) {
      toast.error("Could not generate brief", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-sun-200 bg-gradient-to-br from-sun-50 via-white to-orange-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="sun-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Today&apos;s AI sales brief</h3>
            <p className="text-xs text-slate-500">What needs your attention right now</p>
          </div>
        </div>
        <Button size="sm" variant={brief ? "ghost" : "primary"} onClick={load} loading={loading}>
          {!loading && (brief ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />)}
          {brief ? "Refresh" : "Generate"}
        </Button>
      </div>
      {brief ? (
        <ul className="mt-4 space-y-2">
          {brief
            .split("\n")
            .map((l) => l.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
            .map((l, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sun-500" />
                <span>{l}</span>
              </li>
            ))}
          {source === "rules" && <li className="pt-1 text-[11px] text-slate-400">Rule-based brief · add an Anthropic API key for AI narrative</li>}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Get a 30-second summary of stale hot leads, overdue follow-ups, flagged quotations and today&apos;s priorities.</p>
      )}
    </div>
  );
}
