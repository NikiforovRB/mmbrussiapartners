import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { badRequest, forbidden, route, unauthenticated } from "@/lib/api";
import { uploadObject } from "@/lib/s3";

export const runtime = "nodejs";

const MAX_SIZE = 1 * 1024 * 1024; // 1 МБ — иконки маленькие
const ALLOWED: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};

/**
 * Загрузка иконки канала связи (техподдержка). Только SVG/PNG (и совместимые
 * растровые форматы). Возвращает относительный URL медиа-прокси кабинета.
 * SVG отдаётся через <img>, поэтому скрипты внутри него не исполняются.
 */
export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    throw forbidden();
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Файл не загружен");
  const ext = ALLOWED[file.type];
  if (!ext) throw badRequest("Допустимы SVG, PNG, WebP, JPG или GIF");
  if (file.size > MAX_SIZE) throw badRequest("Файл слишком большой (макс. 1 МБ)");

  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await uploadObject("support", `icon-${Date.now()}.${ext}`, buffer, file.type);

  return NextResponse.json({
    key: upload.key,
    url: `/api/kb/media?key=${encodeURIComponent(upload.key)}`,
  });
});
