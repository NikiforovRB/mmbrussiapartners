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
import { formatRuDateTime } from "@/lib/dates";
import { statusLabel } from "@/lib/status-labels";
import { forbidden, parseBody, route } from "@/lib/api";
import { requireApprovedUser } from "@/lib/session";
import { siteOrigin } from "@/lib/payments/service";
import {
  reportColumn,
  sanitizeColumnKeys,
  type ReportRow,
  type ReportScope,
} from "@/lib/report-columns";

export const runtime = "nodejs";

const rowSelect = {
  id: true,
  number: true,
  type: true,
  repeatGeneration: true,
  product: true,
  bundle: true,
  productRegion: true,
  versionSoftware: true,
  versionCustom: true,
  issuedWithoutPayment: true,
  price: true,
  basePrice: true,
  status: true,
  createdAt: true,
  dealerComment: true,
  region: true,
  city: true,
  payment: { select: { status: true } },
  dealer: {
    select: {
      email: true,
      dealerProfile: { select: { firstName: true, lastName: true, middleName: true } },
    },
  },
} satisfies Prisma.LicenseSelect;
type LicenseRow = Prisma.LicenseGetPayload<{ select: typeof rowSelect }>;

const schema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  status: z.enum(["ACTIVE", "CANCELLED"]).nullable().optional(),
  // Синтетический «вид» лицензии: gen (обычная) или repeat (повторная генерация).
  type: z.string().nullable().optional(),
  product: z.string().trim().max(80).nullable().optional(),
  // Мультивыбор представителей (только для admin scope).
  dealerIds: z.array(z.string()).optional(),
  scope: z.enum(["dealer", "admin"]),
  /** Видимые колонки в нужном порядке — для XLSX. */
  columns: z.array(z.string()).max(40).optional(),
  // Если true — вернуть данные для экранного просмотра (JSON), без генерации XLSX.
  preview: z.boolean().optional(),
});

// Лимит строк экранного просмотра, чтобы не тянуть весь список в UI.
const PREVIEW_LIMIT = 100;
// Сколько лицензий читаем из базы за раз при выгрузке в XLSX.
const EXPORT_BATCH = 1000;

const MONEY_FORMAT = '#,##0.00 "₽"';

function money(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function toReportRow(l: LicenseRow, scope: ReportScope): ReportRow {
  const price = money(l.price);
  const payment = l.payment
    ? statusLabel("payment", l.payment.status)
    : l.issuedWithoutPayment
      ? "Без оплаты"
      : !price
        ? "Бесплатно"
        : "Счёт не выставлен";
  const row: ReportRow = {
    id: l.id,
    number: l.number,
    createdAt: formatRuDateTime(l.createdAt),
    type: l.repeatGeneration ? "Повторная генерация" : l.type,
    product: l.product ?? "",
    bundle: l.bundle ?? "",
    productRegion: l.productRegion ?? "",
    versionSoftware: l.versionSoftware ?? "",
    versionCustom: l.versionCustom ?? "",
    price,
    payment,
    paymentStatus: l.payment?.status ?? null,
    issuedWithoutPayment: l.issuedWithoutPayment,
    status: l.status,
    statusLabel: statusLabel("license", l.status),
    dealer:
      fioFromParts({
        firstName: l.dealer.dealerProfile?.firstName,
        lastName: l.dealer.dealerProfile?.lastName,
        middleName: l.dealer.dealerProfile?.middleName,
      }) || l.dealer.email,
    dealerEmail: l.dealer.email,
    dealerComment: l.dealerComment ?? "",
    region: l.region ?? "",
    city: l.city ?? "",
  };
  // Базовая цена — внутренняя информация: представителю её не отдаём вовсе.
  if (scope === "admin") {
    const basePrice = money(l.basePrice);
    row.basePrice = basePrice;
    row.margin = basePrice !== null && price ? Math.round((price - basePrice) * 100) / 100 : null;
  }
  return row;
}

export const POST = route(async (req: Request) => {
  const session = await requireApprovedUser();

  const { from, to, status, type, product, dealerIds, scope, columns, preview } = await parseBody(req, schema);

  if (
    scope === "admin" &&
    !hasPermission(session.user.permissions, "reports.export", session.user.isSuperAdmin)
  ) {
    throw forbidden("Нет права экспортировать отчёты");
  }

  const where: Prisma.LicenseWhereInput = {
    createdAt: { gte: new Date(from), lte: new Date(to) },
    deletedAt: null,
  };
  if (scope === "dealer") {
    where.dealerId = session.user.id;
  } else if (dealerIds && dealerIds.length > 0) {
    where.dealerId = { in: dealerIds };
  }
  if (status) where.status = status;
  if (product) where.product = product;
  if (type === "repeat") where.repeatGeneration = true;
  else if (type === "gen") where.repeatGeneration = false;

  if (preview) {
    const [count, rows, sums] = await Promise.all([
      db.license.count({ where }),
      db.license.findMany({
        where,
        select: rowSelect,
        orderBy: { createdAt: "desc" },
        take: PREVIEW_LIMIT,
      }),
      db.license.aggregate({ where, _sum: { price: true, basePrice: true } }),
    ]);
    return NextResponse.json({
      count,
      limit: PREVIEW_LIMIT,
      totals: {
        price: Number(sums._sum.price ?? 0),
        ...(scope === "admin" ? { basePrice: Number(sums._sum.basePrice ?? 0) } : {}),
      },
      rows: rows.map((l) => toReportRow(l, scope)),
    });
  }

  const keys = sanitizeColumnKeys(scope, columns);
  const origin = siteOrigin();

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
    ws.columns = keys.map((key) => {
      const def = reportColumn(key);
      return {
        header: def.label,
        key,
        width: def.width,
        ...("money" in def && def.money ? { style: { numFmt: MONEY_FORMAT } } : {}),
      };
    });
    ws.getRow(1).font = { bold: true };

    const totals = { price: 0, basePrice: 0, margin: 0 };
    let count = 0;
    let cursor: string | null = null;
    for (;;) {
      const batch: LicenseRow[] = await db.license.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: EXPORT_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: rowSelect,
      });
      for (const l of batch) {
        const r = toReportRow(l, scope);
        totals.price += r.price ?? 0;
        totals.basePrice += r.basePrice ?? 0;
        totals.margin += r.margin ?? 0;
        const values: Record<string, unknown> = {};
        for (const key of keys) {
          switch (key) {
            case "number":
              values.number = { text: r.number, hyperlink: `${origin}/${scope}/licenses/${r.id}` };
              break;
            case "status":
              values.status = r.statusLabel;
              break;
            case "issuedWithoutPayment":
              values.issuedWithoutPayment = r.issuedWithoutPayment ? "Да" : "";
              break;
            default:
              values[key] = r[key] ?? "";
          }
        }
        const row = ws.addRow(values);
        if (keys.includes("number")) {
          row.getCell("number").font = { color: { argb: "FF0A78D8" }, underline: true };
        }
        row.commit();
      }
      count += batch.length;
      if (batch.length < EXPORT_BATCH) break;
      cursor = batch[batch.length - 1].id;
    }

    const moneyKeys = keys.filter((k) => k === "price" || k === "basePrice" || k === "margin");
    if (count > 0 && moneyKeys.length > 0) {
      const values: Record<string, unknown> = { [keys[0]]: "Итого" };
      for (const k of moneyKeys) values[k] = Math.round(totals[k] * 100) / 100;
      const row = ws.addRow(values);
      row.font = { bold: true };
      row.commit();
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
