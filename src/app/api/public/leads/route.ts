import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, errorResponse, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { leadCreateSchema } from "@/lib/validators";
import { createLead } from "@/lib/services/leads";
import { ApiError } from "@/lib/errors";
import { parseSettings } from "@/lib/settings";
import { sizeSystem } from "@/lib/solar/sizing";

/**
 * Public lead capture.
 *  - Website / landing-page forms post with { orgSlug, ... } (rate-limited per IP, honeypot protected).
 *  - Integrations (Facebook Lead Ads via Zapier/Make, IndiaMART, JustDial, own website backend)
 *    post with header `x-api-key: <org api key>`.
 * Returns an instant solar estimate so the landing page can show it immediately.
 */
const publicSchema = leadCreateSchema
  .pick({ name: true, phone: true, email: true, city: true, pincode: true, address: true, segment: true, monthlyBill: true, monthlyUnits: true, ownsProperty: true, source: true, campaign: true, roofType: true, lat: true, lng: true })
  .extend({ orgSlug: z.string().max(60).optional(), website: z.string().optional() /* honeypot */, consent: z.boolean().optional() });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-api-key" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    const body = await parseBody(req, publicSchema);
    const org = apiKey
      ? await db.organization.findUnique({ where: { apiKey } })
      : body.orgSlug
        ? await db.organization.findUnique({ where: { slug: body.orgSlug } })
        : null;
    if (!org) throw new ApiError(apiKey ? 401 : 404, apiKey ? "Invalid API key" : "Unknown organisation");

    if (!apiKey) {
      await rateLimit(`public-lead:${clientIp(req)}`, 10, 3600);
      if (body.website) return NextResponse.json({ ok: true }, { headers: CORS }); // bot filled the honeypot
    } else {
      await rateLimit(`api-lead:${org.id}`, 2000, 3600);
    }

    const { orgSlug: _s, website: _w, consent: _c, ...lead } = body;
    void _s, _w, _c;
    const { lead: created, duplicate } = await createLead(org.id, { ...lead, source: lead.source ?? "WEBSITE" });
    const s = parseSettings(org.settings);
    const estimate =
      lead.monthlyBill || lead.monthlyUnits
        ? sizeSystem({ monthlyBill: lead.monthlyBill, monthlyUnits: lead.monthlyUnits, segment: lead.segment ?? "RESIDENTIAL" }, s)
        : null;
    return NextResponse.json(
      {
        ok: true,
        reference: created.code,
        duplicate,
        estimate: estimate && {
          systemKw: estimate.recommendedKw,
          panels: estimate.panelCount,
          totalCost: estimate.totalCost,
          subsidy: estimate.subsidy,
          netCost: estimate.netCost,
          monthlySavings: estimate.monthlySavings,
          paybackYears: estimate.paybackYears,
        },
      },
      { status: duplicate ? 200 : 201, headers: CORS },
    );
  } catch (e) {
    const res = errorResponse(e);
    Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}
