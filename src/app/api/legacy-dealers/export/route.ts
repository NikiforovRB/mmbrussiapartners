import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";

type ProductStat = { position: string; count: number; amount: number };

export const GET = route(async () => {
  await requirePermission("dealers.view");
  const rows = await db.legacyDealer.findMany({
    orderBy: [{ licenses: "desc" }, { name: "asc" }],
    include: { user: { select: { email: true } } },
  });

  const moneyFmt = '#,##0.00 "₽"';
  const dateFmt = "dd.mm.yyyy";
  const wb = new ExcelJS.Workbook();
  wb.creator = "MMB RUSSIA Partners";
  wb.created = new Date();

  const ws = wb.addWorksheet("Дилеры", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Дилер", key: "name", width: 30 },
    { header: "Город", key: "city", width: 18 },
    { header: "Страна", key: "country", width: 12 },
    { header: "Источник", key: "source", width: 14 },
    { header: "Email", key: "email", width: 28 },
    { header: "Телефон", key: "phone", width: 16 },
    { header: "Лицензий", key: "licenses", width: 10 },
    { header: "Из своей учётки", key: "viaAccount", width: 12 },
    { header: "Из общего кабинета", key: "viaComment", width: 12 },
    { header: "Оплачено шт.", key: "paid", width: 12 },
    { header: "Не оплачено шт.", key: "unpaid", width: 12 },
    { header: "Сумма", key: "amountTotal", width: 14, style: { numFmt: moneyFmt } },
    { header: "Оплачено", key: "amountPaid", width: 14, style: { numFmt: moneyFmt } },
    { header: "Не оплачено", key: "amountUnpaid", width: 14, style: { numFmt: moneyFmt } },
    { header: "Пополнений", key: "payments", width: 12 },
    { header: "Пополнено", key: "paymentsAmount", width: 14, style: { numFmt: moneyFmt } },
    { header: "Первая лицензия", key: "first", width: 14, style: { numFmt: dateFmt } },
    { header: "Последняя лицензия", key: "last", width: 14, style: { numFmt: dateFmt } },
    { header: "Представитель на портале", key: "portal", width: 28 },
  ];
  for (const r of rows) {
    ws.addRow({
      name: r.name,
      city: r.city,
      country: r.country,
      source: r.source === "account" ? "Учётка ЛК" : "Комментарий",
      email: r.email,
      phone: r.phone ? `+${r.phone}` : null,
      licenses: r.licenses,
      viaAccount: r.viaAccount,
      viaComment: r.viaComment,
      paid: r.paidLicenses,
      unpaid: r.unpaidLicenses,
      amountTotal: Number(r.amountTotal),
      amountPaid: Number(r.amountPaid),
      amountUnpaid: Number(r.amountUnpaid),
      payments: r.payments,
      paymentsAmount: Number(r.paymentsAmount),
      first: r.firstLicenseAt,
      last: r.lastLicenseAt,
      portal: r.user?.email ?? null,
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: "A1", to: "S1" };

  const wp = wb.addWorksheet("Позиции", { views: [{ state: "frozen", ySplit: 1 }] });
  wp.columns = [
    { header: "Дилер", key: "dealer", width: 30 },
    { header: "Позиция", key: "position", width: 34 },
    { header: "Лицензий", key: "count", width: 10 },
    { header: "Сумма", key: "amount", width: 14, style: { numFmt: moneyFmt } },
  ];
  for (const r of rows) {
    const dealer = [r.name, r.city].filter(Boolean).join(", ");
    for (const p of (r.products as ProductStat[] | null) ?? []) {
      wp.addRow({ dealer, position: p.position, count: p.count, amount: p.amount });
    }
  }
  wp.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const name = `drivemods-lk-dealers-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
