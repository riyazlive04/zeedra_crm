import type { RoleName } from "./session";

export const ROLE_LABEL: Record<RoleName, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  SALES_MANAGER: "Sales Manager",
  TELECALLER: "Tele-caller",
  FIELD_SALES: "Field Sales",
  INSTALLER: "Installer",
};

export type Permission =
  | "leads:view_all"
  | "leads:edit"
  | "leads:assign"
  | "leads:delete"
  | "leads:import"
  | "appointments:manage"
  | "quotations:create"
  | "quotations:review"
  | "tracking:view"
  | "whatsapp:send"
  | "templates:manage"
  | "automations:manage"
  | "projects:manage"
  | "reports:view"
  | "users:manage"
  | "settings:manage";

const ALL: Permission[] = [
  "leads:view_all", "leads:edit", "leads:assign", "leads:delete", "leads:import", "appointments:manage",
  "quotations:create", "quotations:review", "tracking:view", "whatsapp:send", "templates:manage",
  "automations:manage", "projects:manage", "reports:view", "users:manage", "settings:manage",
];

const MATRIX: Record<RoleName, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  SALES_MANAGER: [
    "leads:view_all", "leads:edit", "leads:assign", "leads:import", "appointments:manage", "quotations:create",
    "quotations:review", "tracking:view", "whatsapp:send", "templates:manage", "automations:manage",
    "projects:manage", "reports:view",
  ],
  TELECALLER: ["leads:view_all", "leads:edit", "leads:import", "appointments:manage", "whatsapp:send"],
  FIELD_SALES: ["leads:edit", "appointments:manage", "quotations:create", "whatsapp:send"],
  INSTALLER: ["projects:manage"],
};

export function can(role: RoleName, p: Permission): boolean {
  return MATRIX[role]?.includes(p) ?? false;
}

/** Roles that only see leads assigned to them. */
export function isScopedRole(role: RoleName): boolean {
  return !can(role, "leads:view_all");
}
