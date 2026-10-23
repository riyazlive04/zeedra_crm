#!/usr/bin/env node
// Switches the Prisma datasource provider: `node scripts/set-db-provider.mjs postgresql` (or sqlite).
import fs from "node:fs";
const provider = process.argv[2];
if (!["postgresql", "sqlite"].includes(provider)) {
  console.error("Usage: node scripts/set-db-provider.mjs <postgresql|sqlite>");
  process.exit(1);
}
const file = new URL("../prisma/schema.prisma", import.meta.url);
const src = fs.readFileSync(file, "utf8");
const out = src.replace(/(datasource db \{\s*provider\s*=\s*)"[a-z]+"/, `$1"${provider}"`);
fs.writeFileSync(file, out);
console.log(`Prisma provider set to ${provider}`);
