export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSiteSyncScheduler } = await import("@/lib/site-dealers");
  // Локальный dev смотрит в ту же БД, что и прод: второй планировщик не нужен.
  if (process.env.NODE_ENV === "production") startSiteSyncScheduler();
}
