import "server-only";
import { db } from "./db";
import { checkCustomVersion, mergeGenerationSettings } from "./site-settings";

/** Версия кастома попала под запрет генерации — по текущим настройкам. */
export async function isCustomVersionOutdated(versionCustom: string | null | undefined): Promise<boolean> {
  if (!versionCustom?.trim()) return false;
  const row = await db.companySettings.findUnique({ where: { id: "singleton" }, select: { generation: true } });
  return checkCustomVersion(mergeGenerationSettings(row?.generation), versionCustom).blocked;
}
