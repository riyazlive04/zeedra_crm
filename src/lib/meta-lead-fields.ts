/**
 * Maps a Meta Lead Ads submission (Facebook / Instagram instant form) onto a lead. Meta's
 * standard questions have fixed keys (full_name, phone_number, …); custom questions arrive keyed
 * by a slug of the question text, so those are matched by keyword. Anything that doesn't map is
 * returned as `extras` and kept on the lead's timeline.
 */

export interface MetaFieldDatum {
  name: string;
  values?: string[];
}

export interface MappedMetaLead {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  monthlyBill: number | null;
  monthlyUnits: number | null;
  ownsProperty: boolean | null;
  extras: { question: string; answer: string }[];
}

const clean = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** "₹2,000 - ₹3,000" → 2500 · "3000" → 3000 · "above_5000" → 5000. */
export function numberFromAnswer(raw: string): number | null {
  const nums = (raw.replace(/,/g, "").match(/\d+(\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0);
  if (!nums.length) return null;
  const v = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  return Math.round(v);
}

/** Humanises a slug key for the timeline: "what's_your_monthly_bill?" → "What's your monthly bill?" */
const label = (k: string) => {
  const t = k.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function mapMetaFields(fieldData: MetaFieldDatum[]): MappedMetaLead {
  const out: MappedMetaLead = { name: null, phone: null, email: null, city: null, state: null, pincode: null, address: null, monthlyBill: null, monthlyUnits: null, ownsProperty: null, extras: [] };
  let first: string | null = null;
  let last: string | null = null;

  for (const f of fieldData) {
    const value = (f.values ?? []).map((v) => String(v).trim()).filter(Boolean).join(", ");
    if (!value) continue;
    const k = clean(f.name);
    if (k === "full_name" || k === "name") out.name ??= value;
    else if (k === "first_name") first = value;
    else if (k === "last_name") last = value;
    else if (k === "phone_number" || k === "phone" || k === "mobile" || k.includes("mobile_number") || k.includes("whatsapp_number")) out.phone ??= value;
    else if (k === "email" || k === "work_email") out.email ??= value;
    else if (k === "city") out.city ??= value;
    else if (k === "state" || k === "province") out.state ??= value;
    else if (k === "zip_code" || k === "post_code" || k === "postal_code" || k.includes("pin_code") || k.includes("pincode")) out.pincode ??= value.replace(/\D/g, "").slice(0, 6) || null;
    else if (k === "street_address" || k === "address" || k.includes("full_address")) out.address ??= value;
    else if (/(^|_)(units?|kwh)(_|$)/.test(k) && out.monthlyUnits == null) out.monthlyUnits = numberFromAnswer(value);
    else if (/(bill|electricity|eb_|_eb|current_charge)/.test(k) && out.monthlyBill == null) out.monthlyBill = numberFromAnswer(value);
    else if (/(own|owner)/.test(k) && out.ownsProperty == null) {
      const v = value.toLowerCase();
      out.ownsProperty = /^(yes|y|own|owned|true)/.test(v) ? true : /^(no|n|rent|rented|false)/.test(v) ? false : null;
      out.extras.push({ question: label(f.name), answer: value });
    } else out.extras.push({ question: label(f.name), answer: value });
  }
  if (!out.name && (first || last)) out.name = [first, last].filter(Boolean).join(" ");
  if (out.pincode && !/^\d{6}$/.test(out.pincode)) out.pincode = null;
  return out;
}
