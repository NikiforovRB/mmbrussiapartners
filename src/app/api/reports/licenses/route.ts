import { NextResponse } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { uploadObject, getDownloadUrl } from "@/lib/s3";
import { fioFromParts } from "@/lib/utils";
import { formatRuDate } from "@/lib/dates";

export const runtime = "nodejs";

const schema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  status: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  scope: z.enum(["dealer", "admin"]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  const { from, to, status, type, scope } = parsed.data;

  if (scope === "admin" && !hasPermission(session.user.permissions, "reports.export", session.user.isSuperAdmin)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const where: Record<string, unknown> = {
    createdAt: { gte: new Date(from), lte: new Date(to) },
    deletedAt: null,
  };
  if (scope === "dealer") where.dealerId = session.user.id;
  if (status) where.status = status;
  if (type) where.type = type;

  const licenses = await db.license.findMany({
    where,
    include: { dealer: { include: { dealerProfile: true } } },
    orderBy: { createdAt: "desc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "MMB RUSSIA Partners";
  wb.created = new Date();

  const ws = wb.addWorksheet("Лицензии", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Номер", key: "number", width: 22 },
    { header: "Тип", key: "type", width: 10 },
    { header: "Статус", key: "status", width: 14 },
    { header: "Создана", key: "createdAt", width: 18 },
    { header: "Действует до", key: "termEnd", width: 18 },
    { header: "Дилер", key: "dealer", width: 28 },
    { header: "Email дилера", key: "dealerEmail", width: 26 },
    { header: "Клиент ФИО", key: "customerFio", width: 26 },
    { header: "Клиент Email", key: "customerEmail", width: 26 },
    { header: "Клиент телефон", key: "customerPhone", width: 18 },
    { header: "Регион", key: "region", width: 18 },
    { header: "Город", key: "city", width: 18 },
    { header: "VIN", key: "vin", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const l of licenses) {
    ws.addRow({
      number: l.number,
      type: l.type,
      status: l.status,
      createdAt: formatRuDate(l.createdAt),
      termEnd: formatRuDate(l.termEnd),
      dealer: fioFromParts({
        firstName: l.dealer.dealerProfile?.firstName,
        lastName: l.dealer.dealerProfile?.lastName,
        middleName: l.dealer.dealerProfile?.middleName,
      }),
      dealerEmail: l.dealer.email,
      customerFio: l.customerFio,
      customerEmail: l.customerEmail ?? "",
      customerPhone: l.customerPhone ?? "",
      region: l.region ?? "",
      city: l.city ?? "",
      vin: l.vehicleVin ?? "",
    });
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const upload = await uploadObject(
    "exports",
    `mmb-licenses-${Date.now()}.xlsx`,
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const url = await getDownloadUrl(upload.key, 300);
  return NextResponse.json({ url, count: licenses.length });
}
