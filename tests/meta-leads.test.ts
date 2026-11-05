import { describe, expect, it } from "vitest";
import { mapMetaFields, numberFromAnswer } from "@/lib/meta-lead-fields";

describe("Meta Lead Ads field mapping", () => {
  it("maps Meta's standard questions", () => {
    const m = mapMetaFields([
      { name: "full_name", values: ["Ravi Kumar"] },
      { name: "phone_number", values: ["+919876543210"] },
      { name: "email", values: ["ravi@example.com"] },
      { name: "city", values: ["Vellore"] },
      { name: "zip_code", values: ["632 001"] },
      { name: "street_address", values: ["12 Gandhi Road"] },
    ]);
    expect(m).toMatchObject({ name: "Ravi Kumar", phone: "+919876543210", email: "ravi@example.com", city: "Vellore", pincode: "632001", address: "12 Gandhi Road" });
    expect(m.extras).toEqual([]);
  });

  it("joins first and last name when there is no full name", () => {
    expect(mapMetaFields([{ name: "first_name", values: ["Anitha"] }, { name: "last_name", values: ["S"] }]).name).toBe("Anitha S");
  });

  it("reads custom solar questions by keyword and keeps the rest", () => {
    const m = mapMetaFields([
      { name: "what_is_your_monthly_electricity_bill?", values: ["₹2,000 - ₹3,000"] },
      { name: "do_you_own_the_house?", values: ["Yes"] },
      { name: "best_time_to_call", values: ["evening"] },
      { name: "pin_code", values: ["63100"] },
    ]);
    expect(m.monthlyBill).toBe(2500);
    expect(m.ownsProperty).toBe(true);
    expect(m.pincode).toBeNull(); // not 6 digits
    expect(m.extras).toEqual([
      { question: "Do you own the house?", answer: "Yes" },
      { question: "Best time to call", answer: "evening" },
    ]);
  });

  it("parses amounts out of answer labels", () => {
    expect(numberFromAnswer("above_5000")).toBe(5000);
    expect(numberFromAnswer("1,500")).toBe(1500);
    expect(numberFromAnswer("not sure")).toBeNull();
  });
});
