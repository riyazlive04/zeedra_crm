"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

/** Deletes a roof design after a single confirmation. */
export function DeleteDesignButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (!confirm(`Delete the design "${name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/designs/${id}`, { method: "DELETE" });
      toast.success("Design deleted");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't delete the design", (e as Error).message);
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={del} disabled={busy} title="Delete design" aria-label={`Delete ${name}`} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
