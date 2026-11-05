"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, MessageCircle, Phone, Mail, Trash2, Sun } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

const btn = "grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-teal-700";

/** Quick actions on a lead row: design, quote, WhatsApp, call, email, delete. */
export function LeadRowActions({ id, name, phone, email, canDelete, canQuote }: { id: string; name: string; phone: string; email: string | null; canDelete: boolean; canQuote: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const del = async () => {
    if (!confirm(`Delete lead ${name}? This removes its activity, visits and quotations.`)) return;
    try {
      await api(`/api/leads/${id}`, { method: "DELETE" });
      toast.success("Lead deleted");
      router.refresh();
    } catch (e) {
      toast.error("Could not delete", (e as Error).message);
    }
  };
  return (
    <div className="flex items-center gap-0.5">
      <Link href={`/designs?leadId=${id}`} className={btn} title="Roof design & shading"><Sun className="h-4 w-4" /></Link>
      {canQuote && <Link href={`/quotations/new?leadId=${id}`} className={btn} title="New quotation"><FileText className="h-4 w-4" /></Link>}
      <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className={`${btn} hover:text-green-600`} title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>
      <a href={`tel:+${phone}`} className={btn} title="Call"><Phone className="h-4 w-4" /></a>
      {email ? (
        <a href={`mailto:${email}`} className={btn} title="Email"><Mail className="h-4 w-4" /></a>
      ) : (
        <span className={`${btn} cursor-not-allowed opacity-30`} title="No email on file"><Mail className="h-4 w-4" /></span>
      )}
      {canDelete && (
        <button type="button" onClick={del} className={`${btn} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Delete"><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  );
}
