import "server-only";

import { db } from "./db";
import { mergeCabinetSections, type CabinetSections } from "./site-settings";

export async function getCabinetSections(): Promise<CabinetSections> {
  const settings = await db.companySettings.findUnique({ where: { id: "singleton" }, select: { sections: true } });
  return mergeCabinetSections(settings?.sections);
}
