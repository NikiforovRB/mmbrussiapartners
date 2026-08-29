import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDownloadUrl } from "@/lib/s3";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, notFound, route, unauthenticated } from "@/lib/api";

export const runtime = "nodejs";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const { id } = await ctx.params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) throw notFound("Лицензия не найдена");

  // licenses.view есть и у представителя: без проверки административной
  // области ссылка на чужой файл выдавалась бы любому дилеру.
  const isOwner = license.dealerId === session.user.id;
  const canView =
    isOwner ||
    (hasAdminScope(session.user.permissions, session.user.isSuperAdmin) &&
      hasPermission(session.user.permissions, "licenses.view", session.user.isSuperAdmin));
  if (!canView) throw forbidden();
  if (!license.licenseKey) throw badRequest("Файл лицензии не сгенерирован");

  return NextResponse.json({ url: await getDownloadUrl(license.licenseKey, 300) });
});
