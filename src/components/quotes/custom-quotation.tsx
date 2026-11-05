"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";

/**
 * Shows a quotation built from the organisation's own HTML template. It renders in a sandboxed
 * frame (no scripts), sized to its content, so the template's styles can't leak into the app.
 */
export function CustomQuotation({ html, showPrint = true, className }: { html: string; showPrint?: boolean; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1200);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const fit = () => {
      const doc = frame.contentDocument;
      if (doc?.documentElement) setHeight(Math.max(400, doc.documentElement.scrollHeight + 8));
    };
    frame.addEventListener("load", fit);
    const t = setInterval(fit, 800); // fonts/images settling
    const stop = setTimeout(() => clearInterval(t), 6000);
    return () => {
      frame.removeEventListener("load", fit);
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [html]);

  return (
    <div className={className}>
      {showPrint && (
        <div className="no-print mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => ref.current?.contentWindow?.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title="Quotation"
        srcDoc={html}
        // allow-same-origin lets us measure the height and print; scripts stay blocked.
        sandbox="allow-same-origin allow-modals"
        className="mx-auto block w-full max-w-[900px] rounded-lg border border-slate-200 bg-white shadow-sm"
        style={{ height }}
      />
    </div>
  );
}
