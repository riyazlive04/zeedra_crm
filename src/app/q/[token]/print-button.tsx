"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      Download PDF
    </button>
  );
}
