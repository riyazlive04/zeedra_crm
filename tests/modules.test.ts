import { describe, expect, it } from "vitest";
import { defaultModules, effectiveModules, effectivePermissions, homeFor, moduleForPath } from "@/lib/modules";
import { can } from "@/lib/rbac";

describe("module access", () => {
  it("role defaults match the old menus", () => {
    expect(defaultModules("INSTALLER")).toEqual(expect.arrayContaining(["projects", "pm"]));
    expect(defaultModules("INSTALLER")).not.toContain("leads");
    expect(defaultModules("TELECALLER")).not.toContain("quotations");
    expect(defaultModules("ADMIN")).toContain("settings");
  });

  it("the owner always has every module", () => {
    expect(effectiveModules("OWNER", ["leads"]).length).toBeGreaterThan(10);
  });

  it("ticking a module grants its permissions; unticking removes them", () => {
    const tele = effectivePermissions("TELECALLER", [...defaultModules("TELECALLER"), "quotations"]);
    expect(tele).toContain("quotations:create");
    expect(can({ role: "TELECALLER", perms: tele }, "quotations:create")).toBe(true);
    const noWa = effectivePermissions("SALES_MANAGER", defaultModules("SALES_MANAGER").filter((m) => m !== "whatsapp" && m !== "nurture"));
    expect(noWa).not.toContain("whatsapp:send");
  });

  it("data-scope rights stay with the role", () => {
    const perms = effectivePermissions("FIELD_SALES", ["leads", "automations"]);
    expect(perms).not.toContain("leads:view_all");
    expect(perms).not.toContain("leads:delete");
    expect(effectivePermissions("SALES_MANAGER", ["leads"])).toContain("leads:view_all");
  });

  it("maps URLs to modules and finds a home page", () => {
    expect(moduleForPath("/leads/abc")).toBe("leads");
    expect(moduleForPath("/pm-dashboard")).toBe("pm");
    expect(moduleForPath("/projects")).toBe("projects");
    expect(moduleForPath("/settings")).toBeNull();
    expect(moduleForPath("/help")).toBeNull();
    expect(homeFor(["projects", "pm"])).toBe("/projects");
    expect(homeFor([])).toBe("/help");
  });
});
