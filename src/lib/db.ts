import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DB_QUERY_LOG=1 prints every query with its start time and duration (performance profiling).
const profiling = process.env.DB_QUERY_LOG === "1";

function create() {
  if (!profiling) return new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
  const c = new PrismaClient({ log: [{ emit: "event", level: "query" }, "error"] });
  c.$on("query", (e) => console.log(`[q] ${e.timestamp.toISOString()} ${String(e.duration).padStart(4)}ms ${e.query.replace(/\s+/g, " ").slice(0, 140)}`));
  return c as unknown as PrismaClient;
}

export const db = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
