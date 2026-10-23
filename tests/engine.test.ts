import { describe, expect, it } from "vitest";
import { computeSlots, tzOffsetMinutes, weekday, zonedDateTime } from "@/lib/scheduling";
import { evaluateConditions } from "@/lib/automation/types";
import { buildLineItems } from "@/lib/solar/quote";
import { sizeSystem } from "@/lib/solar/sizing";
import { DEFAULT_SETTINGS as S } from "@/lib/settings";
import { leadCreateSchema } from "@/lib/validators";
import { DEFAULT_RULES, DEFAULT_TEMPLATES } from "@/lib/defaults";
import { templateVariables } from "@/lib/text";

describe("scheduling", () => {
  it("knows IST is UTC+5:30", () => {
    expect(tzOffsetMinutes("Asia/Kolkata", new Date("2026-10-22T00:00:00Z"))).toBe(330);
  });
  it("converts wall-clock IST to UTC", () => {
    expect(zonedDateTime("2026-10-22", "09:00", "Asia/Kolkata").toISOString()).toBe("2026-10-22T03:30:00.000Z");
  });
  it("computes weekday of a date string", () => {
    expect(weekday("2026-10-25")).toBe(0); // Sunday
  });
  it("generates slots, blocks busy time with travel buffer, hides past slots", () => {
    const busy = [{ start: zonedDateTime("2026-10-22", "11:00", "Asia/Kolkata"), end: zonedDateTime("2026-10-22", "12:00", "Asia/Kolkata") }];
    const slots = computeSlots({
      date: "2026-10-22",
      tz: "Asia/Kolkata",
      workdayStart: "09:00",
      workdayEnd: "13:00",
      slotMinutes: 60,
      workdays: [1, 2, 3, 4, 5, 6],
      busy,
      bufferMinutes: 15,
      now: zonedDateTime("2026-10-22", "09:30", "Asia/Kolkata"),
    });
    expect(slots.map((s) => s.available)).toEqual([false /* past */, false /* buffer before 11 */, false /* busy */, false /* buffer after 12 */]);
    expect(slots).toHaveLength(4);
  });
  it("returns no slots on non-working days", () => {
    expect(computeSlots({ date: "2026-10-25", tz: "Asia/Kolkata", workdayStart: "09:00", workdayEnd: "18:00", slotMinutes: 60, workdays: [1, 2, 3, 4, 5, 6], busy: [] })).toEqual([]);
  });
});

describe("automation conditions", () => {
  const lead = { temperature: "HOT", stage: "QUALIFIED", monthlyBill: 3200, objection: "FINANCE" };
  it("matches eq / neq / in / gte / lte", () => {
    expect(evaluateConditions([{ field: "temperature", op: "eq", value: "HOT" }], lead)).toBe(true);
    expect(evaluateConditions([{ field: "temperature", op: "neq", value: "HOT" }], lead)).toBe(false);
    expect(evaluateConditions([{ field: "temperature", op: "in", value: ["HOT", "WARM"] }], lead)).toBe(true);
    expect(evaluateConditions([{ field: "monthlyBill", op: "gte", value: 3000 }], lead)).toBe(true);
    expect(evaluateConditions([{ field: "monthlyBill", op: "lte", value: 3000 }], lead)).toBe(false);
  });
  it("requires all conditions and treats empty as match", () => {
    expect(evaluateConditions([], lead)).toBe(true);
    expect(
      evaluateConditions(
        [
          { field: "temperature", op: "eq", value: "HOT" },
          { field: "objection", op: "eq", value: "PRICE" },
        ],
        lead,
      ),
    ).toBe(false);
  });
  it("numeric comparisons fail safely on missing values", () => {
    expect(evaluateConditions([{ field: "score", op: "gte", value: 10 }], {})).toBe(false);
  });
});

describe("quotation line items", () => {
  it("allocates the subtotal exactly across the bill of materials", () => {
    for (const units of [120, 333, 777, 2400]) {
      const sz = sizeSystem({ monthlyUnits: units }, S);
      const items = buildLineItems(sz, { panelBrand: "Waaree", panelWattage: 550, inverterBrand: "Growatt" }, S.bomRates);
      expect(items.reduce((a, b) => a + b.amount, 0)).toBe(sz.subtotal);
      expect(items[0].qty).toBe(sz.panelCount);
    }
  });
});

describe("validation & defaults", () => {
  it("accepts form-style strings and blank values", () => {
    const r = leadCreateSchema.parse({ name: "Ravi", phone: "9876543210", email: "", monthlyBill: "2500", ownsProperty: "true", pincode: "", lat: "" });
    expect(r.monthlyBill).toBe(2500);
    expect(r.ownsProperty).toBe(true);
    expect(r.email).toBeNull();
    expect(r.lat).toBeNull();
  });
  it("rejects bad PIN codes and short names", () => {
    expect(leadCreateSchema.safeParse({ name: "R", phone: "9876543210" }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ name: "Ravi", phone: "9876543210", pincode: "12" }).success).toBe(false);
  });
  it("every default automation references an existing template", () => {
    const keys = new Set(DEFAULT_TEMPLATES.map((t) => t.key));
    for (const r of DEFAULT_RULES) for (const a of r.actions) if (a.type === "SEND_WHATSAPP") expect(keys.has(a.templateKey)).toBe(true);
  });
  it("default templates only use supported variables", () => {
    const supported = new Set([
      "name", "fullName", "company", "companyPhone", "leadCode", "city", "bill", "units", "kw", "panels", "panelWattage", "cost", "subsidy", "netCost",
      "savings", "annualSavings", "payback", "emi", "loanTenure", "salesperson", "salespersonPhone", "date", "time", "quoteNumber", "validUntil", "quoteLink",
      "projectStage", "projectCode",
    ]);
    for (const t of DEFAULT_TEMPLATES) for (const v of templateVariables(t.body)) expect(supported.has(v), `${t.key}: {{${v}}}`).toBe(true);
  });
});
