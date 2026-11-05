import { z } from "zod";
import { MODULE_KEYS } from "./modules";

/** Built-in roles a company-defined role can be based on (one owner per company, so not OWNER). */
export const BASE_ROLES = ["ADMIN", "SALES_MANAGER", "TELECALLER", "FIELD_SALES", "INSTALLER"] as const;

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Give the role a name").max(60),
  baseRole: z.enum(BASE_ROLES),
  modules: z.array(z.enum(MODULE_KEYS as [string, ...string[]])).min(1, "Tick at least one module"),
});
