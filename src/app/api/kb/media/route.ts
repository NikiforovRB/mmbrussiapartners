import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { badRequest, route, unauthenticated } from "@/lib/api";
import { getDownloadUrl, S3_PREFIX } from "@/lib/s3";

export const runtime = "nodejs";

// Отдаёт изображение статьи по ключу: проверяет доступ и редиректит на
// свежую подписанную ссылку. Ключи ограничены папкой базы знаний.
export const GET = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();

  const key = new URL(req.url).searchParams.get("key") ?? "";
  // Проксируем только медиа кабинета: статьи базы знаний и иконки техподдержки.
  const allowed = [`${S3_PREFIX}knowledge/`, `${S3_PREFIX}support/`];
  if (!key || !allowed.some((p) => key.startsWith(p)) || key.includes("..")) {
    throw badRequest("Некорректный ключ");
  }

  const url = await getDownloadUrl(key, 3600);
  return NextResponse.redirect(url);
});
