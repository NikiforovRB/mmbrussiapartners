import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, parseBody, route } from "@/lib/api";
import { huPass, describeDriveModsFailure, isDriveModsConfigured } from "@/lib/drivemods";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  serial: z.string().trim().min(1, "Укажите серийный номер ШГУ HUMAX").max(128, "Слишком длинный серийный номер"),
  comment: z.string().trim().max(500).optional().or(z.literal("")),
});

export const POST = route(async (req: Request) => {
  const session = await requireApprovedUser();
  if (!isDriveModsConfigured()) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Интеграция генерации не настроена. Обратитесь к администратору.",
    );
  }

  const { serial, comment } = await parseBody(req, schema);
  const note = comment?.trim() || undefined;

  let generated;
  try {
    generated = await huPass(serial, note);
  } catch (err) {
    console.error("[hupass] генерация пароля HUMAX не удалась", err);
    const { status, message } = describeDriveModsFailure(err);
    throw new ApiError("UPSTREAM", message, status);
  }

  const record = await db.humaxPassword.create({
    data: {
      dealerId: session.user.id,
      serial: generated.huSerial,
      password: generated.huPass,
      comment: note ?? null,
    },
    select: { id: true, serial: true, password: true, comment: true, createdAt: true },
  });

  return NextResponse.json({
    id: record.id,
    serial: record.serial,
    password: record.password,
    comment: record.comment,
    createdAt: record.createdAt.toISOString(),
  });
});
