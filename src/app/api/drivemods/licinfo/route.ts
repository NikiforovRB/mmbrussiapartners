import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateDeviceIdFile } from "@/lib/license-engine";
import { licInfo, productFullName, DriveModsError, isDriveModsConfigured } from "@/lib/drivemods";
import { ApiError, badRequest, forbidden, route, unauthenticated } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const form = await req.formData();
  const file = form.get("device");
  if (!(file instanceof File)) throw badRequest("Не загружен файл device_id.bin");

  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDeviceIdFile(buf);
  if (!validation.ok) throw badRequest(validation.reason);

  try {
    const info = await licInfo(buf.toString("base64"));
    return NextResponse.json({
      recoverable: info.recoverable,
      versionSoftware: info.version_software,
      versionCustom: info.version_custom,
      deviceId: info.device_id,
      items: info.items.map((it, index) => ({
        index,
        product: it.product,
        bundle: it.bundle,
        region: it.region,
        fullName: productFullName(it),
      })),
    });
  } catch (err) {
    const status = err instanceof DriveModsError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Ошибка запроса к DRIVEMODS";
    throw new ApiError("UPSTREAM", message, status);
  }
});
