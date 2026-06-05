import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts, formatCurrency } from "@/lib/utils";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { CreditCard, Sparkles } from "lucide-react";
import { formatRuDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DealerPaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/login");

  const payments = await db.payment.findMany({
    where: { dealerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Платежи"
        subtitle="История оплат и баланс"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <Card tone="dark" className="relative overflow-hidden mb-5">
          <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full blob"
            style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
          <div className="relative grid sm:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/60">Atol Online</div>
              <h2 className="mt-2 font-display text-3xl  tracking-tightest">
                Оплата online
              </h2>
              <p className="mt-2 text-white/70 max-w-md">
                Интеграция Atol Online готова к подключению. Как только будут предоставлены учётные данные, оплата заработает в один клик.
              </p>
            </div>
            <div className="rounded-panel surface-glass-dark p-5 text-center">
              <Sparkles className="h-5 w-5 text-bg-accent mx-auto" />
              <div className="mt-2 text-sm">Скоро</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-accent" />
            <div className="font-display  tracking-tight">История платежей</div>
          </div>
          {payments.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">
              Пока платежей нет
            </div>
          ) : (
            <table className="w-full text-sm rounded-panel bg-white overflow-hidden">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Описание</th>
                  <th className="px-4 py-3">Сумма</th>
                  <th className="px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={p.id} style={i > 0 ? { boxShadow: "inset 0 1px 0 #c1cbe1" } : undefined}>
                    <td className="px-4 py-3">{formatRuDate(p.createdAt)}</td>
                    <td className="px-4 py-3">{p.description ?? "—"}</td>
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
          )}
        </Card>
      </div>
    </>
  );
}
