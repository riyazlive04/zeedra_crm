#!/usr/bin/env node
// Switches the Prisma datasource provider: `node scripts/set-db-provider.mjs postgresql` (or sqlite).
// For PostgreSQL it picks up whichever connection variables the host provides (Vercel/Neon integrations
// use different names) and wires a direct, non-pooled URL for migrations when one is available —
// migrations cannot run through a transaction-mode pooler (Neon, Supabase, PgBouncer).
import fs from "node:fs";

const provider = process.argv[2];
if (!["postgresql", "sqlite"].includes(provider)) {
  console.error("Usage: node scripts/set-db-provider.mjs <postgresql|sqlite>");
  process.exit(1);
}

const first = (names) => names.find((v) => process.env[v]);
let urlVar = "DATABASE_URL";
let directVar;

if (provider === "postgresql") {
  urlVar = first(["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"]);
  directVar = first(["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DIRECT_URL"]);
  if (!urlVar) {
    const seen = Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|PG/.test(k));
    console.error(
      [
        "",
        "✖ No PostgreSQL connection found (looked for DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL).",
        `  Database-related variables present: ${seen.length ? seen.join(", ") : "none"}`,
        "  On Vercel: Project → Storage → Create Database → Neon (Postgres) → Connect to this project",
        "  (tick Production and Preview, leave the env-variable prefix empty), then Deployments → Redeploy.",
        "  Elsewhere: set DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}

const file = new URL("../prisma/schema.prisma", import.meta.url);
const src = fs.readFileSync(file, "utf8");
const datasource = [
  "datasource db {",
  `  provider = "${provider}"`,
  `  url      = env("${urlVar}")`,
  ...(directVar ? [`  directUrl = env("${directVar}")`] : []),
  "}",
].join("\n");
fs.writeFileSync(file, src.replace(/datasource db \{[^}]*\}/, datasource));
console.log(`Prisma provider set to ${provider} (url: ${urlVar}${directVar ? `, migrations: ${directVar}` : ""})`);
