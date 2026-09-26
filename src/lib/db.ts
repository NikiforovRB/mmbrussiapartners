import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Явный пул вместо дефолта Prisma (2 × CPU + 1): его размер не должен зависеть
 * от машины, а суммарно все процессы не должны выбирать лимит подключений
 * Postgres. Параметры, уже заданные в DATABASE_URL, не трогаем.
 */
const POOL_DEFAULTS = { connection_limit: "10", pool_timeout: "10", connect_timeout: "5" };

function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  let result = url;
  for (const [key, value] of Object.entries(POOL_DEFAULTS)) {
    if (new RegExp(`[?&]${key}=`).test(result)) continue;
    result += `${result.includes("?") ? "&" : "?"}${key}=${value}`;
  }
  return result;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: withPoolDefaults(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type { Prisma } from "@prisma/client";
