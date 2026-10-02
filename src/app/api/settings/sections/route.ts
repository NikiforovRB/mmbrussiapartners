import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cabinetSectionsSchema } from "@/lib/site-settings";
import { parseBody, route } from "@/lib/api";
import { recordAdminAction } from "@/lib/admin-audit";
import { getCabinetSections } from "@/lib/cabinet-sections";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

const LABEL = { legacyLk: "«ЛК DriveMods»", knowledge: "«База знаний»" } as const;

/** Включает и выключает разделы кабинета представителя; можно передать один раздел. */
export const PATCH = route(async (req: Request) => {
  const session = await requirePermission("settings.edit");
  const patch = await parseBody(req, cabinetSectionsSchema.partial());

  const before = await getCabinetSections();
  const sections = { ...before, ...patch };

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: { sections },
    create: {
      id: "singleton",
      phone: "8 (925) 037-46-66",
      email: "marat@mmbrussia.ru",
      publicPhones: [],
      sections,
    },
  });

  const changed = (Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((k) => before[k] !== sections[k]);
  if (changed.length > 0) {
    await recordAdminAction({
      actorId: session.user.id,
      entity: "SETTINGS",
      entityId: "sections",
      action: "UPDATED",
      summary: changed.map((k) => `${LABEL[k]}: ${sections[k] ? "показан" : "скрыт"} у представителей`).join("; "),
    });
  }

  return NextResponse.json({ ok: true, sections });
});
