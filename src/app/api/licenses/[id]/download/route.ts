import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDownloadUrl } from "@/lib/s3";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const license = await db.license.findUnique({ where: { id } });
  if (!license) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const isOwner = license.dealerId === session.user.id;
  const canView = isOwner ||
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.view", session.user.isSuperAdmin);
  if (!canView) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!license.licenseKey) return NextResponse.json({ error: "Файл не сгенерирован" }, { status: 400 });

  const url = await getDownloadUrl(license.licenseKey, 300);
  return NextResponse.json({ url });
}
