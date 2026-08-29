import { AlertTriangle, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { formatCurrency } from "@/lib/utils";
import { formatRuDate } from "@/lib/dates";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { atolMissingEnv, isAtolConfigured } from "@/lib/payments/atol";
import { getPaymentProvider } from "@/lib/payments/provider";
import { PaymentActions } from "./payment-actions";

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

  const provider = getPaymentProvider();
  const atolReady = isAtolConfigured();
  const missing = atolMissingEnv();

  return (
    <>
      <Topbar
        title="Платежи"
        subtitle="История транзакций по всем дилерам"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6 space-y-5">
        <Card>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-tight text-ink-subtle">Приём оплаты</div>
              <div className="mt-1 font-display tracking-tight">{provider.title}</div>
              <div className="mt-1 text-xs text-ink-muted">
                {provider.id === "manual"
                  ? "Дилер получает счёт, поступление денег подтверждает администратор."
                  : "Оплата картой по ссылке провайдера."}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-tight text-ink-subtle">
                Касса АТОЛ Онлайн (54-ФЗ)
              </div>
              <div className="mt-1 font-display tracking-tight">
                {atolReady ? "Подключена" : "Не настроена"}
              </div>
              {!atolReady ? (
                <div className="mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#a16207] mt-0.5" />
                  <span>Не заданы переменные: {missing.join(", ")}</span>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <div className="font-display text-lg  tracking-tight mb-4">История</div>
          {payments.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Платежей пока нет</div>
          ) : (
            <div className="overflow-x-auto scrollbar-clean rounded-panel bg-white">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Дилер</th>
                    <th className="px-4 py-3">Лицензия</th>
                    <th className="px-4 py-3">Описание</th>
                    <th className="px-4 py-3">Сумма</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Чек</th>
                    <th className="px-4 py-3" />
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
                        <StatusTag kind="payment" status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        {p.receiptStatus ? (
                          <div className="flex items-center gap-2">
                            <StatusTag kind="receipt" status={p.receiptStatus} />
                            {p.receiptUrl ? (
                              <a
                                href={p.receiptUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent inline-flex items-center gap-1 text-xs"
                              >
                                Открыть <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-ink-subtle">—</span>
                        )}
                        {p.receiptError ? (
                          <div className="mt-1 text-[11px] text-danger max-w-[280px]">{p.receiptError}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentActions id={p.id} status={p.status} receiptStatus={p.receiptStatus} />
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
