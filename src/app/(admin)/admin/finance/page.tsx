import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { fioFromParts } from "@/lib/utils";
import { formatRub } from "@/lib/money";
import { formatRuDate } from "@/lib/dates";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Row = {
  dealerId: string;
  name: string;
  sub: string;
  paidAmount: number;
  paidCount: number;
  paid30Amount: number;
  pendingAmount: number;
  pendingCount: number;
  licenses: number;
  lastPaidAt: Date | null;
};

export default async function AdminFinancePage() {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "payments.view", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [paidGroups, pending30unused, pendingGroups, paid30Groups, licenseGroups, lastPaid] =
    await Promise.all([
      db.payment.groupBy({
        by: ["dealerId"],
        where: { status: "PAID" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      Promise.resolve(null),
      db.payment.groupBy({
        by: ["dealerId"],
        where: { status: "PENDING" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.payment.groupBy({
        by: ["dealerId"],
        where: { status: "PAID", paidAt: { gte: since30 } },
        _sum: { amount: true },
      }),
      db.license.groupBy({
        by: ["dealerId"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.payment.groupBy({
        by: ["dealerId"],
        where: { status: "PAID" },
        _max: { paidAt: true },
      }),
    ]);
  void pending30unused;

  const dealerIds = Array.from(
    new Set([
      ...paidGroups.map((g) => g.dealerId),
      ...pendingGroups.map((g) => g.dealerId),
      ...licenseGroups.map((g) => g.dealerId),
    ]),
  );

  const dealers = await db.user.findMany({
    where: { id: { in: dealerIds } },
    include: { dealerProfile: true },
  });
  const dealerMap = new Map(dealers.map((d) => [d.id, d]));

  const paidMap = new Map(paidGroups.map((g) => [g.dealerId, g]));
  const pendingMap = new Map(pendingGroups.map((g) => [g.dealerId, g]));
  const paid30Map = new Map(paid30Groups.map((g) => [g.dealerId, g]));
  const licenseMap = new Map(licenseGroups.map((g) => [g.dealerId, g]));
  const lastPaidMap = new Map(lastPaid.map((g) => [g.dealerId, g._max.paidAt]));

  const rows: Row[] = dealerIds
    .map((id) => {
      const u = dealerMap.get(id);
      const fio = fioFromParts({
        firstName: u?.dealerProfile?.firstName,
        lastName: u?.dealerProfile?.lastName,
        middleName: u?.dealerProfile?.middleName,
      });
      return {
        dealerId: id,
        name: fio || u?.email || "—",
        sub:
          [u?.dealerProfile?.organization, u?.dealerProfile?.city].filter(Boolean).join(" · ") ||
          u?.email ||
          "",
        paidAmount: Number(paidMap.get(id)?._sum.amount ?? 0),
        paidCount: paidMap.get(id)?._count._all ?? 0,
        paid30Amount: Number(paid30Map.get(id)?._sum.amount ?? 0),
        pendingAmount: Number(pendingMap.get(id)?._sum.amount ?? 0),
        pendingCount: pendingMap.get(id)?._count._all ?? 0,
        licenses: licenseMap.get(id)?._count._all ?? 0,
        lastPaidAt: lastPaidMap.get(id) ?? null,
      };
    })
    .sort((a, b) => b.paidAmount - a.paidAmount);

  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalPaid30 = rows.reduce((s, r) => s + r.paid30Amount, 0);
  const totalPending = rows.reduce((s, r) => s + r.pendingAmount, 0);
  const payingDealers = rows.filter((r) => r.paidCount > 0).length;

  return (
    <>
      <Topbar
        title="Финансы по дилерам"
        subtitle="Оплаты, задолженность и активность представителей"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Оплачено всего" value={formatRub(totalPaid)} />
          <StatCard label="Оплачено за 30 дней" value={formatRub(totalPaid30)} />
          <StatCard label="Ожидает оплаты" value={formatRub(totalPending)} />
          <StatCard label="Платящих дилеров" value={String(payingDealers)} />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline font-display text-lg tracking-tight">
            Разбивка по представителям
          </div>

          {/* Мобильные карточки */}
          <ul className="md:hidden divide-y divide-hairline">
            {rows.length === 0 ? (
              <li className="px-5 py-12 text-center text-ink-muted text-sm">Данных пока нет</li>
            ) : null}
            {rows.map((r) => (
              <li key={r.dealerId} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate">{r.name}</div>
                    <div className="truncate text-xs text-ink-muted">{r.sub}</div>
                  </div>
                  <div className="font-display tracking-tight shrink-0">{formatRub(r.paidAmount)}</div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>Платежей: {r.paidCount}</span>
                  <span>Лицензий: {r.licenses}</span>
                  {r.pendingAmount > 0 ? (
                    <span className="text-[#a16207]">
                      Долг: {formatRub(r.pendingAmount)} ({r.pendingCount})
                    </span>
                  ) : null}
                  <span>{r.lastPaidAt ? formatRuDate(r.lastPaidAt) : "—"}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Десктоп-таблица */}
          <div className="hidden md:block overflow-x-auto scrollbar-clean">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                  <th className="px-5 py-3">Представитель</th>
                  <th className="px-5 py-3 text-right">Оплачено</th>
                  <th className="px-5 py-3 text-right">За 30 дней</th>
                  <th className="px-5 py-3 text-right">Платежей</th>
                  <th className="px-5 py-3 text-right">Ожидает</th>
                  <th className="px-5 py-3 text-right">Лицензий</th>
                  <th className="px-5 py-3">Последняя оплата</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-ink-muted">
                      Данных пока нет
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.dealerId} className="border-t border-hairline transition-colors hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <div>{r.name}</div>
                      <div className="text-xs text-ink-muted">{r.sub}</div>
                    </td>
                    <td className="px-5 py-3 text-right font-display tracking-tight">
                      {formatRub(r.paidAmount)}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-muted">{formatRub(r.paid30Amount)}</td>
                    <td className="px-5 py-3 text-right text-ink-muted">{r.paidCount}</td>
                    <td className="px-5 py-3 text-right">
                      {r.pendingAmount > 0 ? (
                        <span className="text-[#a16207]">
                          {formatRub(r.pendingAmount)}
                          <span className="text-ink-subtle"> ({r.pendingCount})</span>
                        </span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-muted">{r.licenses}</td>
                    <td className="px-5 py-3 text-ink-muted">
                      {r.lastPaidAt ? formatRuDate(r.lastPaidAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</div>
      <div className="mt-1 font-display text-xl lg:text-2xl tracking-tight">{value}</div>
    </Card>
  );
}
