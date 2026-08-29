import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Receipt } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { fioFromParts, formatCurrency } from "@/lib/utils";
import { formatRuDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DealerPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const [user, payment, company] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: { dealerProfile: true, role: true },
    }),
    db.payment.findUnique({ where: { id }, include: { license: true } }),
    db.companySettings.findFirst(),
  ]);
  if (!user) redirect("/login");
  if (!payment || payment.dealerId !== user.id) notFound();

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  const external = payment.payUrl?.startsWith("http") ? payment.payUrl : null;

  return (
    <>
      <Topbar
        title="Счёт на оплату"
        subtitle={`№ ${payment.id.slice(-8).toUpperCase()}`}
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6 max-w-2xl space-y-4">
        <Link href="/dealer/payments" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> К списку платежей
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-tight text-ink-subtle">К оплате</div>
              <div className="mt-1 font-display text-4xl tracking-tightest">
                {formatCurrency(Number(payment.amount))}
              </div>
              <div className="mt-1 text-sm text-ink-muted">{payment.description ?? "Лицензия MMB RUSSIA"}</div>
            </div>
            <StatusTag kind="payment" status={payment.status} />
          </div>

          <div className="divider my-5" />

          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <Field label="Выставлен" value={formatRuDateTime(payment.createdAt)} />
            <Field
              label="Оплачен"
              value={payment.paidAt ? formatRuDateTime(payment.paidAt) : "—"}
            />
            <Field label="Лицензия" value={payment.license?.number ?? "—"} />
            <Field label="Плательщик" value={user.dealerProfile?.organization || fio || user.email} />
          </dl>

          {payment.status === "PENDING" ? (
            <div className="mt-5">
              {external ? (
                <a href={external} target="_blank" rel="noreferrer">
                  <Button icon={<ExternalLink className="h-4 w-4" />}>Перейти к оплате</Button>
                </a>
              ) : (
                <div className="rounded-panel bg-white p-4 text-sm">
                  <div className="font-display tracking-tight mb-2">Как оплатить</div>
                  <p className="text-ink-muted">
                    Переведите сумму по реквизитам MMB RUSSIA, указав в назначении платежа номер счёта{" "}
                    <span className="text-ink">{payment.id.slice(-8).toUpperCase()}</span>. После
                    поступления средств администратор подтвердит оплату, и фискальный чек придёт на{" "}
                    <span className="text-ink">{user.email}</span>.
                  </p>
                  {company ? (
                    <div className="mt-3 text-xs text-ink-muted space-y-0.5">
                      <div>Телефон: {company.phone}</div>
                      <div>E-mail: {company.email}</div>
                      {company.address ? <div>Адрес: {company.address}</div> : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </Card>

        {payment.status === "PAID" ? (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="h-4 w-4 text-accent" />
              <div className="font-display tracking-tight">Фискальный чек</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusTag kind="receipt" status={payment.receiptStatus} />
              {payment.fiscalDocNumber ? (
                <span className="text-xs text-ink-muted">ФД № {payment.fiscalDocNumber}</span>
              ) : null}
              {payment.receiptUrl ? (
                <a
                  href={payment.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent inline-flex items-center gap-1 text-sm"
                >
                  Открыть чек <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            {payment.receiptStatus === "wait" ? (
              <p className="mt-2 text-xs text-ink-muted">
                Чек передан в кассу и появится здесь в течение нескольких минут.
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-tight text-ink-subtle">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
