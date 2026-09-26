import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { db, type Prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { uploadFile, getDownloadUrl } from "@/lib/s3";
import { fioFromParts } from "@/lib/utils";
import { formatRuDate } from "@/lib/dates";
import { statusLabel } from "@/lib/status-labels";
import { forbidden, parseBody, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";

export const runtime = "nodejs";

const exportSelect = {
  id: true,
  number: true,
  repeatGeneration: true,
  product: true,
  versionSoftware: true,
  versionCustom: true,
  issuedWithoutPayment: true,
  status: true,
  createdAt: true,
  dealerComment: true,
  region: true,
  city: true,
  dealer: {
    select: {
      email: true,
      dealerProfile: { select: { firstName: true, lastName: true, middleName: true } },
    },
  },
} satisfies Prisma.LicenseSelect;
type ExportRow = Prisma.LicenseGetPayload<{ select: typeof exportSelect }>;

const schema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  status: z.string().nullable().optional(),
  // Синтетический «вид» лицензии: gen (обычная) или repeat (повторная генерация).
  type: z.string().nullable().optional(),
  // Мультивыбор представителей (только для admin scope).
  dealerIds: z.array(z.string()).optional(),
  scope: z.enum(["dealer", "admin"]),
  // Если true — вернуть данные для экранного просмотра (JSON), без генерации XLSX.
  preview: z.boolean().optional(),
});

// Лимит строк экранного просмотра, чтобы не тянуть весь список в UI.
const PREVIEW_LIMIT = 100;
// Сколько лицензий читаем из базы за раз при выгрузке в XLSX.
const EXPORT_BATCH = 1000;

export const POST = route(async (req: Request) => {
  const session = await requireApprovedUser();

  const { from, to, status, type, dealerIds, scope, preview } = await parseBody(req, schema);

  if (
    scope === "admin" &&
    !hasPermission(session.user.permissions, "reports.export", session.user.isSuperAdmin)
  ) {
    throw forbidden("Нет права экспортировать отчёты");
  }

  const where: Record<string, unknown> = {
    createdAt: { gte: new Date(from), lte: new Date(to) },
    deletedAt: null,
  };
  if (scope === "dealer") {
    where.dealerId = session.user.id;
  } else if (dealerIds && dealerIds.length > 0) {
    where.dealerId = { in: dealerIds };
  }
  if (status) where.status = status;
  if (type === "repeat") where.repeatGeneration = true;
  else if (type === "gen") where.repeatGeneration = false;

  if (preview) {
    const [count, rows] = await Promise.all([
      db.license.count({ where }),
      db.license.findMany({
        where,
        include: { dealer: { include: { dealerProfile: true } } },
        orderBy: { createdAt: "desc" },
        take: PREVIEW_LIMIT,
      }),
    ]);
    return NextResponse.json({
      count,
      limit: PREVIEW_LIMIT,
      rows: rows.map((l) => ({
        id: l.id,
        number: l.number,
        kind: l.repeatGeneration ? "Повторная генерация" : "Генерация",
        product: l.product ?? "",
        versionCustom: l.versionCustom ?? "",
        status: l.status,
        statusLabel: statusLabel("license", l.status),
        createdAt: formatRuDate(l.createdAt),
        dealer:
          fioFromParts({
            firstName: l.dealer.dealerProfile?.firstName,
            lastName: l.dealer.dealerProfile?.lastName,
            middleName: l.dealer.dealerProfile?.middleName,
          }) || l.dealer.email,
        region: l.region ?? "",
        city: l.city ?? "",
      })),
    });
  }

  // Файл пишется потоком на диск пачками строк: память не растёт вместе с
  // объёмом отчёта, а в S3 он уходит тоже потоком.
  const dir = await mkdtemp(join(tmpdir(), "mmb-report-"));
  const file = join(dir, "licenses.xlsx");
  try {
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: file,
      useStyles: true,
      useSharedStrings: false,
    });
    wb.creator = "MMB RUSSIA Partners";
    wb.created = new Date();

    const ws = wb.addWorksheet("Лицензии", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = [
      { header: "Номер", key: "number", width: 22 },
      { header: "Тип лицензии", key: "type", width: 16 },
      { header: "Продукт", key: "product", width: 26 },
      { header: "Версия ПО", key: "versionSoftware", width: 30 },
      { header: "Версия кастома", key: "versionCustom", width: 16 },
      { header: "Без оплаты", key: "issuedWithoutPayment", width: 12 },
      { header: "Статус", key: "status", width: 14 },
      { header: "Создана", key: "createdAt", width: 18 },
      { header: "Дилер", key: "dealer", width: 28 },
      { header: "Email дилера", key: "dealerEmail", width: 26 },
      { header: "Комментарий дилера", key: "dealerComment", width: 26 },
      { header: "Регион", key: "region", width: 18 },
      { header: "Город", key: "city", width: 18 },
    ];
    ws.getRow(1).font = { bold: true };

    let count = 0;
    let cursor: string | null = null;
    for (;;) {
      const batch: ExportRow[] = await db.license.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: EXPORT_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: exportSelect,
      });
      for (const l of batch) {
        ws.addRow({
          number: l.number,
          type: l.repeatGeneration ? "Повторная генерация" : "Генерация",
          product: l.product ?? "",
          versionSoftware: l.versionSoftware ?? "",
          versionCustom: l.versionCustom ?? "",
          issuedWithoutPayment: l.issuedWithoutPayment ? "Да" : "",
          status: statusLabel("license", l.status),
          createdAt: formatRuDate(l.createdAt),
          dealer: fioFromParts({
            firstName: l.dealer.dealerProfile?.firstName,
            lastName: l.dealer.dealerProfile?.lastName,
            middleName: l.dealer.dealerProfile?.middleName,
          }),
          dealerEmail: l.dealer.email,
          dealerComment: l.dealerComment ?? "",
          region: l.region ?? "",
          city: l.city ?? "",
        }).commit();
      }
      count += batch.length;
      if (batch.length < EXPORT_BATCH) break;
      cursor = batch[batch.length - 1].id;
    }
    ws.commit();
    await wb.commit();

    const upload = await uploadFile(
      "exports",
      `mmb-licenses-${Date.now()}.xlsx`,
      file,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const url = await getDownloadUrl(upload.key, 300);
    return NextResponse.json({ url, count });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
