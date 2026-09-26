import { NextResponse } from "next/server";
import { validateDeviceIdFile } from "@/lib/license-engine";
import {
  licInfo,
  productFullName,
  describeDriveModsFailure,
  isDriveModsConfigured,
} from "@/lib/drivemods";
import { ApiError, badRequest, route } from "@/lib/api";
import { db } from "@/lib/db";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { generationBlockReason, mergeGenerationSettings } from "@/lib/site-settings";
import { resolvePrices } from "@/lib/pricing";
import { isRepeatGeneration } from "@/lib/repeat-generation";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const session = await requireApprovedUser();
  if (!isDriveModsConfigured()) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Интеграция генерации не настроена. Обратитесь к администратору.",
    );
  }

  const form = await req.formData();
  const file = form.get("device");
  if (!(file instanceof File)) throw badRequest("Не загружен файл device_id.bin");

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDeviceIdFile(buf);
  if (!validation.ok) throw badRequest(validation.reason);

  try {
    const info = await licInfo(buf.toString("base64"));

    // Те же ограничения, что и при генерации (/createlic), — чтобы дилер узнал
    // о запрете сразу, а не после заполнения всех шагов.
    const bypassesRules =
      session.user.isSuperAdmin ||
      hasPermission(session.user.permissions, "dealers.setLimit", session.user.isSuperAdmin);
    if (!bypassesRules) {
      const settings = await db.companySettings.findUnique({
        where: { id: "singleton" },
        select: { generation: true },
      });
      const reason = generationBlockReason(mergeGenerationSettings(settings?.generation), info.version_custom);
      if (reason) throw badRequest(reason);
    }

    if (info.items.length === 0) {
      throw badRequest(
        "Не найдено доступных продуктов для этого устройства. " +
          "Проверьте, что загружен device_id.bin от нужного ШГУ.",
      );
    }
    // Цены считает сервер по справочнику и правилам этого представителя:
    // ровно та же сумма попадёт в счёт, что бы ни прислал браузер. Повторная
    // генерация бесплатна.
    const repeat = await isRepeatGeneration(info.device_id, info.recoverable);
    const prices = repeat ? null : await resolvePrices(session.user.id, info.items);

    // Представитель видит только свои прошлые выдачи по этому ШГУ,
    // администратор — любые.
    const seesAll = hasAdminScope(session.user.permissions, session.user.isSuperAdmin);
    const previous = await db.license.findFirst({
      where: {
        deviceId: info.device_id,
        deletedAt: null,
        ...(seesAll ? {} : { dealerId: session.user.id }),
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, createdAt: true, type: true },
    });

    // Обновление API DRIVEMODS: first_gen/last_gen — unix-секунды первой и
    // последней генерации по этому ШГУ на стороне DRIVEMODS. Это авторитетнее
    // нашей базы: покрывает выдачи, сделанные вне портала.
    const firstGeneratedAt = info.firstGen ? new Date(info.firstGen * 1000).toISOString() : null;
    const lastGeneratedAt = info.lastGen ? new Date(info.lastGen * 1000).toISOString() : null;

    return NextResponse.json({
      // DRIVEMODS отдаёт признак прошлой выдачи: recoverable означает, что
      // лицензия для этого ШГУ у него уже есть.
      recoverable: info.recoverable,
      repeat,
      firstGeneratedAt,
      lastGeneratedAt,
      previous: previous
        ? {
            id: previous.id,
            number: previous.number,
            type: previous.type,
            createdAt: previous.createdAt.toISOString(),
          }
        : null,
      versionSoftware: info.version_software,
      versionCustom: info.version_custom,
      deviceId: info.device_id,
      items: info.items.map((it, index) => ({
        index,
        product: it.product,
        bundle: it.bundle,
        region: it.region,
        fullName: productFullName(it),
        price: prices ? prices[index].price : 0,
        /** Цена взята из справочника, а не из запасной настройки. */
        priced: prices ? prices[index].itemId !== null : true,
        /** Первая генерация позиции идёт по клиентской цене. */
        firstAtClientPrice: prices ? prices[index].basis === "client_first" : false,
      })),
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("[licinfo] запрос к DRIVEMODS не удался", err);
    const { status, message } = describeDriveModsFailure(err);
    throw new ApiError("UPSTREAM", message, status);
  }
});
