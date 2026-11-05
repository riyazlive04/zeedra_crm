"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { agreementBlocks, type AgrBlock, type AgreementData, type Inline } from "@/lib/solar/agreement";

function Text({ inline }: { inline: Inline }) {
  return (
    <>
      {inline.map((s, i) => (s.bold ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function Block({ b }: { b: AgrBlock }) {
  switch (b.kind) {
    case "title":
      return <div className="ag-title"><Text inline={b.inline} /></div>;
    case "center":
      return <div className="ag-c"><Text inline={b.inline} /></div>;
    case "heading":
      return <div className="ag-h"><Text inline={b.inline} /></div>;
    case "small":
      return <div className="ag-small"><Text inline={b.inline} /></div>;
    case "para":
      return <div className="ag-p"><Text inline={b.inline} /></div>;
    case "clause":
      return (
        <div className="ag-cl">
          <span className="ag-n">{b.n}.</span>
          <span><Text inline={b.inline} /></span>
        </div>
      );
    case "schedHead":
      return <div className="ag-psh">PROJECT COST &amp; PAYMENT SCHEDULE</div>;
    case "sched":
      return <div className="ag-ps"><Text inline={b.inline} /></div>;
    case "signatures": {
      const d = b.data;
      const dt = d.date.split("-").reverse().join("-");
      const lines = (t: string) => t.split(/\s*\n\s*/).map((l, i, all) => (
        <span key={i}>
          {l}
          {i < all.length - 1 && <br />}
        </span>
      ));
      return (
        <div className="ag-sig">
          <div>
            <b>First Party</b>
            <br />
            <b>{d.cust_name}</b>
            <br />
            {lines(d.cust_address)} - {d.pincode}
            <div className="ag-sp" />
            <div className="ag-line">First Party Signature</div>
            Date: {dt}
          </div>
          <div>
            <b>Second Party</b>
            <br />
            <b>{d.vendor_name}</b>
            <br />
            {lines(d.vendor_address)}
            <div className="ag-sp" />
            <div className="ag-line">Second Party Signature</div>
            Date: {dt}
          </div>
        </div>
      );
    }
  }
}

const keeps = (b: AgrBlock) => "keep" in b && Boolean(b.keep);

/**
 * The agreement as A4 pages. Blocks are measured off-screen, then packed page by page; a heading
 * (or the clause leading into the payment schedule) never ends a page — it moves to the next one.
 */
export function AgreementPages({ data }: { data: AgreementData }) {
  const blocks = useMemo(() => agreementBlocks(data), [data]);
  const measureRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const run = () => {
      const box = measureRef.current;
      const unit = unitRef.current;
      if (!box || !unit || cancelled) return;
      const mm = unit.offsetHeight / 100;
      const bodyH = 254 * mm;
      const heights = Array.from(box.children).map((el) => (el as HTMLElement).offsetHeight);
      const out: number[][] = [[]];
      let used = data.stamp ? 128 * mm : 0;
      heights.forEach((h, i) => {
        const page = out[out.length - 1];
        if (used + h > bodyH + 1 && page.length > 0) {
          const prev = page[page.length - 1];
          const carry = page.length > 1 && keeps(blocks[prev]) ? page.pop() : undefined;
          const next: number[] = carry !== undefined ? [carry] : [];
          out.push(next);
          used = carry !== undefined ? heights[carry] : 0;
        }
        out[out.length - 1].push(i);
        used += h;
      });
      setPages(out);
    };
    if (document.fonts?.ready) document.fonts.ready.then(run);
    else run();
    return () => {
      cancelled = true;
    };
  }, [blocks, data.stamp]);

  return (
    <div className="relative">
      <div ref={unitRef} className="ag-measure ag-unit-mm" aria-hidden="true" />
      <div ref={measureRef} className="ag-measure" aria-hidden="true">
        {blocks.map((b, i) => (
          <div key={i} className="ag-blk">
            <Block b={b} />
          </div>
        ))}
      </div>
      {(pages ?? [blocks.map((_, i) => i)]).map((idx, p, all) => (
        <div key={p} className="ag-page">
          <div className="ag-body">
            {p === 0 && data.stamp && <div className="ag-stamp" />}
            {idx.map((i) => (
              <div key={i} className="ag-blk">
                <Block b={blocks[i]} />
              </div>
            ))}
          </div>
          <div className="ag-foot">
            <span>First Party: ____________</span>
            <span>
              Page {p + 1} of {all.length}
            </span>
            <span>Second Party: ____________</span>
          </div>
        </div>
      ))}
    </div>
  );
}
