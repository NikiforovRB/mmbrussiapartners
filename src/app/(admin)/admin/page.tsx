import {
  Users,
  KeyRound,
  TrendingUp,
  CalendarClock,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { addDays, formatRuDate } from "@/lib/dates";
import { fioFromParts, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) return null;

  const monthAgo = addDays(new Date(), -30);
  const [
    pendingDealers,
    activeLicenses,
    recentLicenses,
    last30,
    revenue,
    recentPending,
  ] = await Promise.all([
    db.user.count({ where: { status: "PENDING" } }),
    db.license.count({ where: { status: "ACTIVE", deletedAt: null } }),
    db.license.count({ where: { deletedAt: null } }),
    db.license.count({ where: { deletedAt: null, createdAt: { gte: monthAgo } } }),
    db.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    db.user.findMany({
      where: { status: "PENDING" },
      include: { dealerProfile: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Кабинет администратора"
        subtitle={formatRuDate(new Date())}
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <ScrollReveal className="mt-6">
        <Card tone="dark" className="relative overflow-hidden">
          <div className="absolute -top-32 -right-20 h-80 w-80 rounded-full blob"
            style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
          <div className="relative grid sm:grid-cols-[1fr_auto] gap-6 items-end">
            <div>
              <h2 className="font-display text-3xl  tracking-tightest">
                Управление сетью дилеров
              </h2>
              <p className="mt-3 text-white/70">
                Одобряйте дилеров, редактируйте лицензии, выгружайте отчёты и следите за гео-распределением сети.
              </p>
            </div>
            <Link href="/admin/dealers">
              <Button variant="primary">Перейти к представителям</Button>
            </Link>
          </div>
        </Card>
      </ScrollReveal>

      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Users className="h-4 w-4" />} label="Заявок на одобрение" value={String(pendingDealers)} />
        <Kpi icon={<ShieldCheck className="h-4 w-4" />} label="Активных лицензий" value={String(activeLicenses)} />
        <Kpi icon={<KeyRound className="h-4 w-4" />} label="Лицензий всего" value={String(recentLicenses)} />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Оплачено"
          value={formatCurrency(Number(revenue._sum.amount ?? 0))}
        />
      </div>

      <div className="mt-5 grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-display text-lg  tracking-tight">Заявки на одобрение</div>
              <div className="text-xs text-ink-muted">Свежие заявки представителей</div>
            </div>
            <Link href="/admin/dealers?status=PENDING">
              <Button variant="ghost" size="sm" iconRight={<ArrowUpRight className="h-4 w-4" />}>
                Все заявки
              </Button>
            </Link>
          </div>
          {recentPending.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Все заявки рассмотрены</div>
          ) : (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {recentPending.map((u) => (
                <li key={u.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="">
                      {fioFromParts({
                        firstName: u.dealerProfile?.firstName,
                        lastName: u.dealerProfile?.lastName,
                        middleName: u.dealerProfile?.middleName,
                      })}
                    </div>
                    <div className="text-xs text-ink-muted">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-ink-muted">
                    <StatusTag kind="user" status={u.status} />
                    <span>{formatRuDate(u.createdAt)}</span>
                    <Link href={`/admin/dealers/${u.id}`}>
                      <Button size="sm" variant="secondary">Открыть</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-accent" />
            <div className="font-display  tracking-tight">За 30 дней</div>
          </div>
          <div className="font-display text-4xl  tracking-tightest">{last30}</div>
          <div className="text-xs text-ink-muted mt-1">сгенерировано лицензий</div>
          <div className="divider my-4" />
          <div className="text-xs text-ink-muted">
            Подробная аналитика, экспорт XLSX и фильтрация — в разделе "Отчёты".
          </div>
        </Card>
      </div>
    </>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-panel bg-card-light p-5 hover-lift">
      <div className="flex items-center gap-2.5 text-ink-muted">
        <span className="grid h-9 w-9 place-items-center rounded-panel bg-white text-accent">{icon}</span>
        <div className="text-xs">{label}</div>
      </div>
      <div className="mt-3 font-display text-2xl  tracking-tight">{value}</div>
    </div>
  );
}
