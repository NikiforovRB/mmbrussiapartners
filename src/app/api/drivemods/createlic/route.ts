import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { ApiError, badRequest, forbidden, parseBody, route, unauthenticated } from "@/lib/api";
import { uploadObject, getDownloadUrl, deleteObject } from "@/lib/s3";
import { createLic, describeDriveModsFailure, isDriveModsConfigured } from "@/lib/drivemods";
import { generateLicenseNumber, normalizePhone, fioFromParts } from "@/lib/utils";
import { isLicenseType, isLicenseTerm, termEndFromMonths } from "@/lib/license-options";
import { licensePrice } from "@/lib/payments/provider";
import { createPayment } from "@/lib/payments/service";
import { notifyAdmins } from "@/lib/app-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Потолок на device_id.bin — такой же, как в /licinfo. */
const MAX_DEVICE_BYTES = 5 * 1024 * 1024;
const MAX_DEVICE_BASE64 = Math.ceil((MAX_DEVICE_BYTES * 4) / 3) + 64;

const schema = z.object({
  deviceBase64: z.string().min(1).max(MAX_DEVICE_BASE64, "Файл device_id.bin слишком большой"),
  deviceId: z.string().optional().or(z.literal("")),
  type: z.string().min(1),
  product: z.string().min(1),
  bundle: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  termMonths: z.number().int().optional(),
  versionSoftware: z.string().optional().or(z.literal("")),
  versionCustom: z.string().optional().or(z.literal("")),
  dealerComment: z.string().optional().or(z.literal("")),
  customerFio: z.string().optional().or(z.literal("")),
  customerOrganization: z.string().optional().or(z.literal("")),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().optional().or(z.literal("")),
  customerRegion: z.string().optional().or(z.literal("")),
  customerCity: z.string().optional().or(z.literal("")),
  issuedWithoutPayment: z.boolean().optional(),
});

export const POST = route(async (req: Request) => {
  const session = await auth();
  if (!session?.user) throw unauthenticated();
  if (session.user.status !== "APPROVED") throw forbidden("Аккаунт не одобрен");
  if (!isDriveModsConfigured()) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Интеграция DRIVEMODS не настроена. Обратитесь к администратору.",
    );
  }

  const p = await parseBody(req, schema);
  if (!isLicenseType(p.type)) throw badRequest("Неверный тип лицензии");

  const termMonths = p.termMonths ?? 0;
  if (!isLicenseTerm(termMonths)) throw badRequest("Неверный срок лицензии");

  const actor = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true },
  });
  if (!actor) throw unauthenticated();

  // Лимитом не связан тот, кто этими лимитами управляет. Право licenses.create
  // здесь не подходит: оно есть и у представителя, а значит не отличает
  // администратора и обнулило бы проверку остатка для всех.
  const bypassesLimit =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "dealers.setLimit", session.user.isSuperAdmin);
  if (!bypassesLimit && !actor.dealerProfile) throw badRequest("Профиль не найден");

  const canIssueFree = hasPermission(
    session.user.permissions,
    "licenses.issueFree",
    session.user.isSuperAdmin,
  );
  const issuedWithoutPayment = canIssueFree && p.issuedWithoutPayment === true;

  // Слот занимаем до похода во внешний API: между проверкой остатка и
  // инкрементом лежат две загрузки в S3 и генерация, и без резервирования
  // два параллельных запроса пробили бы лимит.
  const limited = Boolean(actor.dealerProfile) && !bypassesLimit;
  if (limited) {
    const reserved = await db.dealerProfile.updateMany({
      where: { userId: actor.id, licensesUsed: { lt: actor.dealerProfile!.licenseLimit } },
      data: { licensesUsed: { increment: 1 } },
    });
    if (reserved.count === 0) throw forbidden("Лимит лицензий исчерпан");
  }

  const releaseSlot = async () => {
    if (!limited) return;
    await db.dealerProfile
      .update({ where: { userId: actor.id }, data: { licensesUsed: { decrement: 1 } } })
      .catch((err) => console.error("[createlic] не удалось вернуть слот лимита", err));
  };

  // Всё, что уже легло в S3: при срыве удаляем, чтобы не копить файлы
  // без записей в базе.
  const uploadedKeys: string[] = [];
  const cleanupUploads = async () => {
    await Promise.allSettled(uploadedKeys.map((key) => deleteObject(key)));
  };

  try {
    const deviceBuffer = Buffer.from(p.deviceBase64, "base64");
    if (deviceBuffer.length === 0) throw badRequest("Некорректный файл device_id.bin");
    if (deviceBuffer.length > MAX_DEVICE_BYTES) {
      throw badRequest("Файл device_id.bin больше 5 МБ");
    }

    const dealerName =
      fioFromParts({
        firstName: actor.dealerProfile?.firstName,
        lastName: actor.dealerProfile?.lastName,
        middleName: actor.dealerProfile?.middleName,
      }) || actor.email;
    const dealerComment = (p.dealerComment || dealerName).trim();

    const licenseNumber = await uniqueLicenseNumber();

    const deviceIdUpload = await uploadObject(
      "deviceIds",
      `${licenseNumber}-device-id.bin`,
      deviceBuffer,
      "application/octet-stream",
    );
    uploadedKeys.push(deviceIdUpload.key);

    let generated;
    try {
      generated = await createLic({
        deviceIdBase64: p.deviceBase64,
        product: p.product,
        bundle: p.bundle || null,
        region: p.region || null,
        versionSoftware: p.versionSoftware || "",
        versionCustom: p.versionCustom || "",
        dealerComment,
        deviceId: p.deviceId || "",
      });
    } catch (err) {
      console.error("[createlic] генерация в DRIVEMODS не удалась", err);
      const { status, message } = describeDriveModsFailure(err);
      throw new ApiError("UPSTREAM", message, status);
    }

    const licenseUpload = await uploadObject(
      "licenses",
      generated.lic_filename || `${licenseNumber}-device-license.bin`,
      Buffer.from(generated.lic_file, "base64"),
      "application/octet-stream",
    );
    uploadedKeys.push(licenseUpload.key);

    const termStart = new Date();
    const termEnd = termEndFromMonths(termStart, termMonths);
    const price = issuedWithoutPayment ? 0 : licensePrice(p.bundle);

    const license = await db.$transaction(async (tx) => {
      const created = await tx.license.create({
        data: {
          number: licenseNumber,
          dealerId: actor.id,
          type: p.type,
          status: "ACTIVE",
          price: price || null,
          features: {},
          termStart,
          termEnd,
          deviceId: generated.device_id || p.deviceId || "",
          deviceIdKey: deviceIdUpload.key,
          licenseKey: licenseUpload.key,
          product: p.product,
          bundle: p.bundle || null,
          productRegion: p.region || null,
          versionSoftware: p.versionSoftware || null,
          versionCustom: p.versionCustom || null,
          dealerComment,
          issuedWithoutPayment,
          customerFio: (p.customerFio || dealerComment).trim(),
          customerOrganization: p.customerOrganization || null,
          customerEmail: p.customerEmail || null,
          customerPhone: p.customerPhone ? normalizePhone(p.customerPhone) : null,
          region: p.customerRegion || null,
          city: p.customerCity || null,
        },
      });
      await tx.licenseAuditLog.create({
        data: {
          licenseId: created.id,
          actorId: actor.id,
          action: "CREATED",
          reason: `${p.type}: ${p.product}`,
        },
      });
      return created;
    });

    const downloadUrl = await getDownloadUrl(licenseUpload.key, 300);

    // Счёт выставляем после генерации: файл уже у дилера, а оплата и чек
    // идут своим циклом. Сбой биллинга не должен терять выданную лицензию.
    let payment: { id: string; amount: number; payUrl: string | null } | null = null;
    if (price > 0) {
      try {
        const created = await createPayment({
          dealerId: actor.id,
          licenseId: license.id,
          amount: price,
          description: `Лицензия ${license.number} · ${p.product}`,
          email: actor.email,
          phone: actor.dealerProfile?.phone,
        });
        payment = { id: created.id, amount: Number(created.amount), payUrl: created.payUrl };
        await notifyAdmins(["payments.manage"], {
          type: "PAYMENT_CREATED",
          title: `Новый счёт на ${Number(created.amount).toLocaleString("ru-RU")} ₽`,
          body: `Лицензия ${license.number}, представитель ${actor.email}`,
          link: `/admin/payments`,
        });
      } catch (err) {
        // Лицензия уже выдана — счёт выставим вручную, но след обязателен.
        console.error(
          `[createlic] не удалось создать счёт по лицензии ${license.number}`,
          err,
        );
        payment = null;
      }
    }

    if (issuedWithoutPayment) {
      await notifyAdmins(["payments.manage"], {
        type: "LICENSE_ISSUED",
        title: `Лицензия ${license.number} выдана без оплаты`,
        body: `Выдал ${actor.email}`,
        link: `/admin/licenses/${license.id}`,
      });
    }

    return NextResponse.json({
      licenseId: license.id,
      number: license.number,
      filename: generated.lic_filename,
      downloadUrl,
      payment,
    });
  } catch (err) {
    await Promise.allSettled([releaseSlot(), cleanupUploads()]);
    throw err;
  }
});

async function uniqueLicenseNumber(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = generateLicenseNumber();
    const exists = await db.license.findUnique({ where: { number: candidate } });
    if (!exists) return candidate;
  }
  throw new ApiError("INTERNAL", "Не удалось сгенерировать уникальный номер лицензии");
}
