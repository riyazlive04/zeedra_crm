#!/usr/bin/env node
// Switches the Prisma datasource provider: `node scripts/set-db-provider.mjs postgresql` (or sqlite).
// For PostgreSQL, a direct (non-pooled) connection is wired in when one is available, because
// migrations cannot run through a transaction-mode pooler (Neon, Supabase, PgBouncer).
import fs from "node:fs";

const provider = process.argv[2];
if (!["postgresql", "sqlite"].includes(provider)) {
  console.error("Usage: node scripts/set-db-provider.mjs <postgresql|sqlite>");
  process.exit(1);
}

// Neon via the Vercel integration exposes DATABASE_URL_UNPOOLED; others commonly use DIRECT_URL.
const directVar = provider === "postgresql" ? ["DATABASE_URL_UNPOOLED", "DIRECT_URL"].find((v) => process.env[v]) : undefined;

const file = new URL("../prisma/schema.prisma", import.meta.url);
const src = fs.readFileSync(file, "utf8");
const datasource = [
  "datasource db {",
  `  provider = "${provider}"`,
  '  url      = env("DATABASE_URL")',
  ...(directVar ? [`  directUrl = env("${directVar}")`] : []),
  "}",
].join("\n");
const out = src.replace(/datasource db \{[^}]*\}/, datasource);
fs.writeFileSync(file, out);
console.log(`Prisma provider set to ${provider}${directVar ? ` (migrations via ${directVar})` : ""}`);
