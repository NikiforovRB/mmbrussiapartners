import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateDeviceIdFile } from "@/lib/license-engine";
import { licInfo, productFullName, DriveModsError, isDriveModsConfigured } from "@/lib/drivemods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (session.user.status !== "APPROVED") {
    return NextResponse.json({ error: "Аккаунт не одобрен" }, { status: 403 });
  }
  if (!isDriveModsConfigured()) {
    return NextResponse.json(
      { error: "Интеграция DRIVEMODS не настроена. Обратитесь к администратору." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("device");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Не загружен файл device_id.bin" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateDeviceIdFile(buf);
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });

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
    return NextResponse.json({ error: message }, { status });
  }
}
