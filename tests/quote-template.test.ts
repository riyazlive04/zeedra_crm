import { describe, expect, it } from "vitest";
import { renderQuoteTemplate, sampleContext, sanitizeTemplate, unknownPlaceholders } from "@/lib/quote-template";

describe("quotation template rendering", () => {
  const ctx = sampleContext();

  it("fills placeholders and escapes HTML in values", () => {
    expect(renderQuoteTemplate("<b>{{customer.name}}</b> {{ price.total }}", ctx)).toBe("<b>Ravi Kumar</b> ₹1,88,025");
    expect(renderQuoteTemplate("{{customer.name}}", { customer: { name: "<script>x</script>" } })).toBe("&lt;script&gt;x&lt;/script&gt;");
    expect(renderQuoteTemplate("[{{nope.missing}}]", ctx)).toBe("[]");
  });

  it("loops over line items with outer values still reachable", () => {
    const out = renderQuoteTemplate("{{#each items}}<tr><td>{{no}}</td><td>{{content}}</td><td>{{customer.name}}</td></tr>{{/each}}", ctx);
    expect(out.match(/<tr>/g)).toHaveLength(4);
    expect(out).toContain("<td>1</td><td>Solar PV modules</td><td>Ravi Kumar</td>");
  });

  it("handles if / else and nesting", () => {
    expect(renderQuoteTemplate("{{#if company.logoUrl}}LOGO{{else}}NO LOGO{{/if}}", ctx)).toBe("NO LOGO");
    expect(renderQuoteTemplate("{{#if items}}{{#each items}}{{#if gst}}+{{/if}}{{/each}}{{/if}}", ctx)).toBe("+++");
    expect(renderQuoteTemplate("{{#if price.stateSubsidy}}S{{/if}}", ctx)).toBe(""); // ₹0 counts as empty
  });

  it("strips anything executable", () => {
    const dirty = `<div onclick="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><iframe src="//evil"></iframe><img src=x onerror=alert(4)></div>`;
    const clean = sanitizeTemplate(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    expect(clean).toContain("<a href=\"#\">x</a>");
  });

  it("flags unknown placeholders", () => {
    expect(unknownPlaceholders("{{customer.name}} {{customer.nmae}} {{#each items}}{{qty}}{{/each}}")).toEqual(["customer.nmae"]);
  });
});
