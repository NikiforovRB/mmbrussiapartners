import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { formatCurrency } from "@/lib/utils";
import { formatRuDate } from "@/lib/dates";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sp = await searchParams;
  const page = parsePage(sp.page);

  const [me, total, payments] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.payment.count(),
    db.payment.findMany({
      include: { dealer: true, license: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <>
      <Topbar
        title="Платежи"
        subtitle="История транзакций по всем дилерам"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">История</div>
          {payments.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Платежей пока нет</div>
          ) : (
            <div className="overflow-x-auto scrollbar-clean rounded-panel bg-white">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Дилер</th>
                    <th className="px-4 py-3">Лицензия</th>
                    <th className="px-4 py-3">Описание</th>
                    <th className="px-4 py-3">Сумма</th>
                    <th className="px-4 py-3">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id} style={i > 0 ? { boxShadow: "inset 0 1px 0 #c1cbe1" } : undefined}>
                      <td className="px-4 py-3">{formatRuDate(p.createdAt)}</td>
                      <td className="px-4 py-3">{p.dealer.email}</td>
                      <td className="px-4 py-3">{p.license?.number ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{p.description ?? "—"}</td>
                      <td className="px-4 py-3 ">{formatCurrency(Number(p.amount))}</td>
                      <td className="px-4 py-3">
                        <Tag
                          tone={
                            p.status === "PAID"
                              ? "success"
                              : p.status === "PENDING"
                                ? "warning"
                                : p.status === "FAILED"
                                  ? "danger"
                                  : "muted"
                          }
                        >
                          {p.status}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/payments" />
        </Card>
      </div>
    </>
  );
}
