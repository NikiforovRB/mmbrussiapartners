import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound, parseBody, route } from "@/lib/api";
import { changedFields, recordAdminAction } from "@/lib/admin-audit";
import { notifyUser } from "@/lib/app-notifications";
import { requirePermission } from "@/lib/session";
import {
  isPublishedOnSite,
  isSiteSyncConfigured,
  queueDealerSiteSync,
  syncDealerToSiteNow,
} from "@/lib/site-dealers";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject", "resync"]),
  note: z.string().trim().max(500, "Не длиннее 500 символов").nullable().optional(),
});

/**
 * Модерация публикации телефона: одобрить (в том числе от имени представителя,
 * если он уже есть на сайте), отклонить заявку или снять с сайта, отправить заново.
 */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("dealers.approve", "Нет права модерировать публикацию на сайте");
  const { id } = await ctx.params;
  const d = await parseBody(req, schema);

  const target = await db.user.findUnique({ where: { id }, include: { dealerProfile: true } });
  const profile = target?.dealerProfile;
  if (!target || !profile) throw notFound("Представитель не найден");

  if (d.action === "resync") {
    if (!isSiteSyncConfigured()) throw badRequest("Интеграция с сайтом не настроена");
    const outcome = await syncDealerToSiteNow(id, "manual");
    return NextResponse.json({ ok: true, outcome });
  }

  const before = {
    phoneVisibleOnSite: profile.phoneVisibleOnSite,
    sitePublication: profile.sitePublication,
    sitePublicationNote: profile.sitePublicationNote,
  };

  if (d.action === "approve") {
    if (!profile.phone.trim()) throw badRequest("У представителя не указан телефон");
    if (!profile.city?.trim()) {
      throw badRequest("Укажите город представителя: без него сайт не примет телефон");
    }
    if (profile.sitePublication === "APPROVED" && profile.phoneVisibleOnSite) {
      throw badRequest("Публикация уже одобрена");
    }
    const after = {
      phoneVisibleOnSite: true,
      sitePublication: "APPROVED" as const,
      sitePublicationNote: null,
    };
    await db.dealerProfile.update({
      where: { userId: id },
      data: { ...after, sitePublicationAt: new Date(), sitePublicationById: session.user.id },
    });
    queueDealerSiteSync(id, "publication");
    await recordAdminAction({
      actorId: session.user.id,
      entity: "DEALER",
      entityId: id,
      action: "SITE_PUBLICATION_APPROVED",
      summary: target.email,
      diff: changedFields(before, after),
    });
    await notifyUser(id, {
      type: "SITE_PUBLICATION_REVIEWED",
      title: "Телефон опубликован на сайте",
      body: "Он появится в «Дилерской сети» на mmbrussia.ru/contacts.",
      link: "/dealer/profile",
    });
    return NextResponse.json({
      ok: true,
      live: isPublishedOnSite(target.status, { ...profile, ...after }),
    });
  }

  if (profile.sitePublication !== "PENDING" && profile.sitePublication !== "APPROVED") {
    throw badRequest("Заявки на публикацию нет");
  }
  const wasApproved = profile.sitePublication === "APPROVED";
  const after = { sitePublication: "REJECTED" as const, sitePublicationNote: d.note || null };
  await db.dealerProfile.update({
    where: { userId: id },
    data: { ...after, sitePublicationAt: new Date(), sitePublicationById: session.user.id },
  });
  queueDealerSiteSync(id, "publication");
  await recordAdminAction({
    actorId: session.user.id,
    entity: "DEALER",
    entityId: id,
    action: wasApproved ? "SITE_PUBLICATION_REVOKED" : "SITE_PUBLICATION_REJECTED",
    summary: target.email,
    diff: changedFields(before, after),
  });
  await notifyUser(id, {
    type: "SITE_PUBLICATION_REVIEWED",
    title: wasApproved ? "Телефон снят с сайта" : "Заявка на публикацию телефона отклонена",
    body: d.note || null,
    link: "/dealer/profile",
  });
  return NextResponse.json({ ok: true, live: false });
});
