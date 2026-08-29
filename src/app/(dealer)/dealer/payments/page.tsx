import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts, formatCurrency } from "@/lib/utils";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { formatRuDate } from "@/lib/dates";
import { getPaymentProvider } from "@/lib/payments/provider";

export const dynamic = "force-dynamic";

export default async function DealerPaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/login");

  // Итоги считает база: складывать первые 100 строк списка — значит показать
  // неверную сумму, как только платежей станет больше.
  const [payments, totals] = await Promise.all([
    db.payment.findMany({
      where: { dealerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.payment.groupBy({
      by: ["status"],
      where: { dealerId: user.id, status: { in: ["PAID", "PENDING"] } },
      _sum: { amount: true },
    }),
  ]);

  const sumFor = (status: "PAID" | "PENDING") =>
    Number(totals.find((t) => t.status === status)?._sum.amount ?? 0);
  const paid = sumFor("PAID");
  const awaiting = sumFor("PENDING");

  const provider = getPaymentProvider();

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Платежи"
        subtitle="История оплат и чеки"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <Card tone="dark" className="relative overflow-hidden mb-5">
          <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full blob"
            style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
          <div className="relative grid sm:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">{provider.title}</div>
              <h2 className="mt-2 font-display text-3xl  tracking-tightest">Оплата лицензий</h2>
              <p className="mt-2 text-white/70 max-w-md">
                {provider.id === "manual"
                  ? "Счёт формируется автоматически. После поступления оплаты администратор подтверждает платёж, и вам приходит фискальный чек."
                  : "Оплата картой по защищённой ссылке. Фискальный чек приходит на вашу почту автоматически."}
              </p>
            </div>
            <div className="rounded-panel surface-glass-dark p-5 text-center min-w-[180px]">
              <div className="text-xs text-white/60">Оплачено</div>
              <div className="mt-1 font-display text-2xl tracking-tight">{formatCurrency(paid)}</div>
              {awaiting > 0 ? (
                <div className="mt-2 text-[11px] text-white/60">
                  ожидает оплаты: {formatCurrency(awaiting)}
                </div>
              ) : null}
            </div>
          </div>
        </Card>
        <div className="rounded-panel border border-hairline overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hairline">
            <CreditCard className="h-4 w-4 text-accent" />
            <div className="font-display  tracking-tight">История платежей</div>
          </div>
          {payments.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Пока платежей нет</div>
          ) : (
            <div className="overflow-x-auto scrollbar-clean">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Описание</th>
                    <th className="px-4 py-3">Сумма</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Чек</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">{formatRuDate(p.createdAt)}</td>
                      <td className="px-4 py-3">{p.description ?? "—"}</td>
                      <td className="px-4 py-3 ">{formatCurrency(Number(p.amount))}</td>
                      <td className="px-4 py-3">
                        <StatusTag kind="payment" status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        {p.receiptUrl ? (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent inline-flex items-center gap-1 text-xs"
                          >
                            Открыть <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === "PENDING" ? (
                          <Link href={`/dealer/payments/${p.id}`}>
                            <Button size="sm" variant="secondary">Оплатить</Button>
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
