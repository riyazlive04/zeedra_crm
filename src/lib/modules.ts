// Per-user module access. Pure (edge/client safe).
//
// Each user sees the modules their role normally has, unless an admin has ticked a custom set.
// A module both shows its menu item / pages and grants the permissions its screens need, so
// ticking "Quotations" for a tele-caller really lets them create quotations. Data-scope rights
// (see every lead vs. only yours, delete, approve quotes, manage users) always stay with the role.
import { can as roleCan, type Permission } from "./rbac";
import type { RoleName } from "./session";

export interface ModuleDef {
  key: string;
  label: string;
  hint: string;
  /** URL prefixes that belong to this module. */
  paths: string[];
  /** Permissions this module's screens need to work. */
  perms: Permission[];
  /** Roles that get it by default. */
  defaultFor: RoleName[] | "all";
}

const SALES: RoleName[] = ["OWNER", "ADMIN", "SALES_MANAGER", "TELECALLER", "FIELD_SALES"];
const MGMT: RoleName[] = ["OWNER", "ADMIN", "SALES_MANAGER"];

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", hint: "Sales overview and KPIs", paths: ["/dashboard"], perms: [], defaultFor: SALES },
  { key: "leads", label: "Leads", hint: "Lead list, lead pages, proposals", paths: ["/leads"], perms: ["leads:edit"], defaultFor: SALES },
  { key: "pipeline", label: "Pipeline", hint: "Kanban board of deals", paths: ["/pipeline"], perms: ["leads:edit"], defaultFor: SALES },
  { key: "appointments", label: "Appointments", hint: "Calendar and bookings", paths: ["/appointments"], perms: ["appointments:manage"], defaultFor: SALES },
  { key: "tasks", label: "Tasks", hint: "Follow-up tasks", paths: ["/tasks"], perms: [], defaultFor: SALES },
  { key: "whatsapp", label: "WhatsApp inbox", hint: "Chat with customers", paths: ["/whatsapp"], perms: ["whatsapp:send"], defaultFor: ["OWNER", "ADMIN", "SALES_MANAGER", "TELECALLER", "FIELD_SALES"] },
  { key: "nurture", label: "WhatsApp Nurture", hint: "Flows and broadcasts", paths: ["/nurture"], perms: ["whatsapp:send", "automations:manage"], defaultFor: MGMT },
  { key: "field", label: "Field App", hint: "Check-ins and on-site quotes", paths: ["/field"], perms: ["quotations:create"], defaultFor: ["OWNER", "ADMIN", "SALES_MANAGER", "FIELD_SALES"] },
  { key: "quotations", label: "Quotations", hint: "Create and send quotes", paths: ["/quotations"], perms: ["quotations:create"], defaultFor: ["OWNER", "ADMIN", "SALES_MANAGER", "FIELD_SALES"] },
  { key: "designs", label: "Roof Design", hint: "Roof layouts and shading", paths: ["/designs"], perms: ["leads:edit"], defaultFor: SALES },
  { key: "tracking", label: "Field Tracking", hint: "Live team locations", paths: ["/tracking"], perms: ["tracking:view"], defaultFor: MGMT },
  { key: "projects", label: "Installations", hint: "Installation projects", paths: ["/projects"], perms: ["projects:manage"], defaultFor: ["OWNER", "ADMIN", "SALES_MANAGER", "INSTALLER"] },
  { key: "pm", label: "PM Dashboard", hint: "Project progress overview", paths: ["/pm-dashboard"], perms: ["projects:manage"], defaultFor: ["OWNER", "ADMIN", "SALES_MANAGER", "INSTALLER"] },
  { key: "automations", label: "Automations", hint: "Rules and triggers", paths: ["/automations"], perms: ["automations:manage"], defaultFor: MGMT },
  { key: "calculator", label: "Solar Calculator", hint: "Quick sizing and savings", paths: ["/calculator"], perms: [], defaultFor: SALES },
  { key: "settings", label: "Settings", hint: "Company, team, templates, billing", paths: [], perms: ["settings:manage", "templates:manage", "users:manage"], defaultFor: ["OWNER", "ADMIN"] },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Pages everyone can always open (own profile, help). */
const ALWAYS_OPEN = ["/help", "/settings"];

export function defaultModules(role: RoleName): string[] {
  return MODULES.filter((m) => m.defaultFor === "all" || m.defaultFor.includes(role)).map((m) => m.key);
}

export function effectiveModules(role: RoleName, custom: unknown): string[] {
  // The owner can never lock themself out.
  if (role === "OWNER") return MODULE_KEYS;
  if (Array.isArray(custom)) return custom.filter((k): k is string => typeof k === "string" && MODULE_KEYS.includes(k));
  return defaultModules(role);
}

/**
 * Role permissions, minus those that only disabled modules provide, plus everything enabled
 * modules need. Permissions not tied to any module (view_all, delete, review, …) follow the role.
 */
export function effectivePermissions(role: RoleName, modules: string[]): Permission[] {
  const all = new Set<Permission>([
    "leads:view_all", "leads:edit", "leads:assign", "leads:delete", "leads:import", "appointments:manage", "quotations:create", "quotations:review",
    "tracking:view", "whatsapp:send", "templates:manage", "automations:manage", "projects:manage", "reports:view", "users:manage", "settings:manage",
  ]);
  const on = new Set(modules);
  const granted = new Set(MODULES.filter((m) => on.has(m.key)).flatMap((m) => m.perms));
  const moduleOwned = new Set(MODULES.flatMap((m) => m.perms));
  return [...all].filter((p) => granted.has(p) || (!moduleOwned.has(p) && roleCan(role, p)));
}

/** Which module a URL belongs to (null = not module-gated). */
export function moduleForPath(pathname: string): string | null {
  if (ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"))) return null;
  const m = MODULES.find((x) => x.paths.some((p) => pathname === p || pathname.startsWith(p + "/")));
  return m?.key ?? null;
}

/** Where to send someone who lands on a module they can't open. */
export function homeFor(modules: string[]): string {
  for (const k of ["dashboard", "leads", "field", "projects", "tasks"]) {
    const m = MODULES.find((x) => x.key === k);
    if (m && modules.includes(k) && m.paths[0]) return m.paths[0];
  }
  const first = MODULES.find((m) => modules.includes(m.key) && m.paths[0]);
  return first?.paths[0] ?? "/help";
}
