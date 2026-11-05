import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { parseDesign } from "@/lib/solar/shading";
import { DesignPreview } from "@/components/design/preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your solar rooftop design", robots: { index: false, follow: false } };

/** Customer-facing, read-only 3D design preview. Access by unguessable share token only. */
export default async function PublicDesignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) notFound();
  const d = await db.solarDesign.findUnique({
    where: { shareToken: token },
    include: {
      lead: { select: { name: true, code: true, segment: true, address: true, city: true, district: true, state: true, pincode: true } },
      organization: { select: { name: true, logoUrl: true, phone: true } },
    },
  });
  if (!d) notFound();
  const address = d.lead ? [d.lead.address, d.lead.city, d.lead.district, d.lead.state, d.lead.pincode].filter(Boolean).join(", ") : null;
  const data = parseDesign(d.data, { lat: d.lat, lng: d.lng });
  // Strip internal-only bits before sending to the browser.
  data.overlay = null;
  return (
    <DesignPreview
      data={data}
      title={d.name}
      customer={d.lead ? { name: d.lead.name, code: d.lead.code, segment: d.lead.segment, address } : null}
      org={d.organization}
      stats={{ systemKw: d.systemKw, panelCount: d.panelCount, shadingLossPct: d.shadingLossPct, annualKwh: d.annualKwh }}
    />
  );
}
