import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Resolve DATABASE_URL the same way the Prisma CLI does: relative to the prisma/ folder. */
function dbFile() {
  const raw = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), "prisma", raw);
}

function make() {
  const adapter = new PrismaBetterSQLite3({ url: dbFile() });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? make();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
