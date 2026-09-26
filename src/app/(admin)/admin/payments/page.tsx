import { AlertTriangle, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { Money } from "@/components/ui/money";
import { formatRuDateTime } from "@/lib/dates";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { atolMissingEnv, isAtolConfigured } from "@/lib/payments/atol";
import { atolPayMethodsPhrase, getPaymentProvider } from "@/lib/payments/provider";
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
  const methodsPhrase = atolPayMethodsPhrase();
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
                  : `Оплата${methodsPhrase ? ` ${methodsPhrase}` : ""} по ссылке АТОЛ Pay. Оплата подтверждается автоматически, чек пробивается сам.`}
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

        <div className="rounded-panel border border-hairline overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline font-display text-lg tracking-tight">
            История
          </div>
          {payments.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Платежей пока нет</div>
          ) : (
            <>
            <ul className="md:hidden divide-y divide-hairline">
              {payments.map((p) => (
                <li key={p.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Money value={Number(p.amount)} className="font-display tracking-tight" />
                    <StatusTag kind="payment" status={p.status} />
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {formatRuDateTime(p.createdAt)} · {p.dealer.email}
                  </div>
                  <div className="mt-1 text-sm">
                    {p.license?.number ? <span className="text-ink">{p.license.number}</span> : null}
                    {p.description ? <span className="text-ink-muted"> · {p.description}</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p.receiptStatus ? <StatusTag kind="receipt" status={p.receiptStatus} /> : null}
                    {p.receiptUrl ? (
                      <a
                        href={p.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent inline-flex items-center gap-1 text-xs"
                      >
                        Чек <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  {p.receiptError ? (
                    <div className="mt-1 text-[11px] text-danger">{p.receiptError}</div>
                  ) : null}
                  <div className="mt-3">
                    <PaymentActions
                      id={p.id}
                      status={p.status}
                      receiptStatus={p.receiptStatus}
                      provider={p.provider}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto scrollbar-clean">
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
                  {payments.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3 whitespace-nowrap">{formatRuDateTime(p.createdAt)}</td>
                      <td className="px-4 py-3">{p.dealer.email}</td>
                      <td className="px-4 py-3">{p.license?.number ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{p.description ?? "—"}</td>
                      <td className="px-4 py-3"><Money value={Number(p.amount)} /></td>
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
                        <PaymentActions
                          id={p.id}
                          status={p.status}
                          receiptStatus={p.receiptStatus}
                          provider={p.provider}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/payments" />
      </div>
    </>
  );
}
