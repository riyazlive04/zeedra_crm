import { describe, expect, it } from "vitest";
import { AGR_TEXT, agrAmounts, agrDateLong, agreementBlocks, agreementConfig, agreementNotReady, agrTextProblem, amountInWords, formatAadhaar, maskAadhaar, stgProblem, type AgreementData } from "@/lib/solar/agreement";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const stages = DEFAULT_SETTINGS.quotation.paymentStages;
const d: AgreementData = {
  date: "2026-11-05",
  cust_name: "Riyaz",
  cust_address: "12 Main Road\nArakkonam",
  pincode: "631001",
  father: "",
  aadhaar: "XXXX XXXX 9012",
  total: 111435,
  advance: 10000,
  stages,
  stamp: true,
  eb: "09-123",
  kw: 1.65,
  vendor_name: "Acme Solar Pvt Ltd",
  vendor_address: "Chennai",
  text: AGR_TEXT,
};

describe("agreement", () => {
  it("writes rupees in Indian words", () => {
    expect(amountInWords(111435)).toBe("Rupees One Lakh Eleven Thousand Four Hundred Thirty Five Only");
    expect(amountInWords(12500000)).toBe("Rupees One Crore Twenty Five Lakh Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });

  it("splits the total over the stages, rounding into the last one", () => {
    const a = agrAmounts(111435, stages);
    expect(a).toEqual([11144, 83576, 16715]);
    expect(a.reduce((t, x) => t + x, 0)).toBe(111435);
  });

  it("formats the long date", () => {
    expect(agrDateLong("2026-11-05")).toBe("5th November 2026");
    expect(agrDateLong("2026-11-22")).toBe("22nd November 2026");
    expect(agrDateLong("2026-11-11")).toBe("11th November 2026");
  });

  it("fills the details and builds the schedule and signatures", () => {
    const blocks = agreementBlocks(d);
    const text = JSON.stringify(blocks.filter((b) => b.kind !== "signatures"));
    expect(text).toContain("5th November 2026");
    expect(text).toContain("12 Main Road, Arakkonam - 631001");
    expect(text).not.toMatch(/\{(date|customer_name|vendor_name)\}/);
    expect(blocks.filter((b) => b.kind === "sched")).toHaveLength(2 + stages.length + 1 + 1); // total, intro, stages, advance, total
    expect(blocks.at(-2)?.kind).toBe("signatures");
    const clause = blocks.find((b) => b.kind === "clause" && b.inline.some((s) => s.text === "MUTUALLY AGREED TERMS OF PAYMENT"));
    expect(clause && "keep" in clause && clause.keep).toBe(true);
  });

  it("validates stages and text", () => {
    expect(stgProblem(stages)).toBe("");
    expect(stgProblem([{ name: "A", pct: 50, when: "now" }])).toMatch(/100%/);
    expect(stgProblem([{ name: "A", pct: 100, when: "" }])).toMatch(/Fill every stage/);
    expect(agrTextProblem("no placeholders")).not.toBe("");
    expect(agrTextProblem(AGR_TEXT)).toBe("");
  });

  it("keeps only the last 4 Aadhaar digits", () => {
    expect(formatAadhaar("123456789012")).toBe("1234 5678 9012");
    expect(formatAadhaar("12345")).toBe("");
    expect(maskAadhaar("1234 5678 9012")).toBe("XXXX XXXX 9012");
  });

  it("is ready out of the box once the company has an address", () => {
    expect(agreementNotReady(agreementConfig(DEFAULT_SETTINGS, { name: "Acme", address: "Chennai" }))).toBe("");
    expect(agreementNotReady(agreementConfig(DEFAULT_SETTINGS, { name: "Acme", address: null }))).toMatch(/registered office/);
  });
});
