import Link from "next/link";
import {
  ArrowUpRight,
  KeyRound,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { DayActivity } from "@/components/dealer/day-activity";
import { fioFromParts, formatCurrency } from "@/lib/utils";
import { formatRuDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DealerDashboard() {
  const session = await auth();
  if (!session?.user) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) return null;

  const [licenses, recent, totalActive, totalRevenue, byStatus, byType] = await Promise.all([
    db.license.count({ where: { dealerId: user.id, deletedAt: null } }),
    db.license.findMany({
      where: { dealerId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.license.count({
      where: { dealerId: user.id, status: "ACTIVE", deletedAt: null },
    }),
    db.payment.aggregate({
      where: { dealerId: user.id, status: "PAID" },
      _sum: { amount: true },
    }),
    db.license.groupBy({
      by: ["status"],
      where: { dealerId: user.id, deletedAt: null },
      _count: { _all: true },
    }),
    db.license.groupBy({
      by: ["type"],
      where: { dealerId: user.id, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  const typeCounts = Object.fromEntries(byType.map((r) => [r.type, r._count._all]));
  const totalForBars = Math.max(1, licenses);
  const statusBreakdown: { key: string; label: string; count: number }[] = [
    { key: "ACTIVE", label: "Активные", count: statusCounts.ACTIVE ?? 0 },
    { key: "EXPIRED", label: "Истекли", count: statusCounts.EXPIRED ?? 0 },
    { key: "CANCELLED", label: "Аннулированы", count: statusCounts.CANCELLED ?? 0 },
    { key: "REVOKED", label: "Отозваны", count: statusCounts.REVOKED ?? 0 },
    { key: "DRAFT", label: "Черновики", count: statusCounts.DRAFT ?? 0 },
  ].filter((s) => s.count > 0);
  const typeBreakdown: { key: string; count: number }[] = [
    { key: "Генерация", count: typeCounts["Генерация"] ?? 0 },
    { key: "Обновление", count: typeCounts["Обновление"] ?? 0 },
    { key: "Восстановление", count: typeCounts["Восстановление"] ?? 0 },
  ].filter((t) => t.count > 0);

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  const limit = user.dealerProfile?.licenseLimit ?? 0;
  const used = user.dealerProfile?.licensesUsed ?? 0;
  const remaining = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <>
      <Topbar
        title={`Здравствуйте, ${user.dealerProfile?.firstName ?? "представитель"}`}
        subtitle={user.role.name}
        user={{
          name: fio || user.email,
          email: user.email,
          role: user.role.name,
        }}
      />

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <ScrollReveal className="lg:col-span-2">
          <Card tone="dark" className="relative overflow-hidden">
            <div
              className="absolute -top-32 -right-20 h-80 w-80 rounded-full blob"
              style={{
                background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)",
              }}
            />
            <div className="relative grid sm:grid-cols-2 gap-6 items-center">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/60">
                  Сегодня
                </div>
                <div className="mt-1.5 text-sm text-white/80">{formatRuDate(new Date())}</div>
                <h2 className="mt-4 font-display text-3xl  tracking-tightest">
                  Готовы выдать
                  <br /> новую лицензию?
                </h2>
                <p className="mt-3 text-white/70 text-sm max-w-sm">
                  Загрузите device-id.bin и за секунду получите device-license.bin.
                </p>
                <div className="mt-6 flex gap-2">
                  <Link href="/dealer/licenses/new">
                    <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                      Создать лицензию
                    </Button>
                  </Link>
                  <Link href="/dealer/licenses">
                    <Button variant="ghost" className="text-white hover:bg-white/10" icon={<KeyRound className="h-4 w-4" />}>
                      Мои лицензии
                    </Button>
                  </Link>
                </div>
              </div>
              <RingProgress used={used} limit={limit} pct={pct} remaining={remaining} />
            </div>
          </Card>
        </ScrollReveal>
        <ScrollReveal delay={0.05}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 h-full">
            <KpiCard
              icon={<KeyRound className="h-4 w-4" />}
              label="Всего лицензий"
              value={String(licenses)}
            />
            <KpiCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Активные"
              value={String(totalActive)}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Оплачено"
              value={formatCurrency(Number(totalRevenue._sum.amount ?? 0))}
            />
          </div>
        </ScrollReveal>
      </div>

      <ScrollReveal>
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="font-display text-lg  tracking-tight">Последние лицензии</div>
              <div className="text-xs text-ink-muted">Самые свежие записи</div>
            </div>
            <Link href="/dealer/licenses">
              <Button variant="ghost" size="sm" iconRight={<ArrowUpRight className="h-4 w-4" />}>
                Все лицензии
              </Button>
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">
              <Sparkles className="h-5 w-5 mx-auto text-ink-subtle" />
              <div className="mt-2">Здесь появятся ваши лицензии</div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-panel bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-tight text-ink-subtle">
                    <th className="px-4 py-3">Номер</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Клиент</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Действует до</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((l, i) => (
                    <tr key={l.id} className={i > 0 ? "border-t border-line/0" : ""}>
                      <td className="px-4 py-3 ">{l.number}</td>
                      <td className="px-4 py-3">
                        <Tag tone={l.type === "Генерация" ? "accent" : "neutral"}>{l.type}</Tag>
                      </td>
                      <td className="px-4 py-3">{l.customerFio}</td>
                      <td className="px-4 py-3">
                        <StatusTag status={l.status} />
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{formatRuDate(l.termEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </ScrollReveal>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <ScrollReveal>
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-accent" />
              <div className="font-display text-lg tracking-tight">Аналитика по лицензиям</div>
            </div>
            {statusBreakdown.length === 0 ? (
              <div className="py-6 text-center text-sm text-ink-muted">Пока нет данных</div>
            ) : (
              <div className="space-y-3">
                {statusBreakdown.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-ink-muted">{s.label}</span>
                      <span className="tracking-tight">{s.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-card-light overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round((s.count / totalForBars) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {typeBreakdown.length > 0 ? (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {typeBreakdown.map((t) => (
                      <Tag key={t.key} tone={t.key === "Генерация" ? "accent" : "neutral"}>
                        {t.key}: {t.count}
                      </Tag>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </ScrollReveal>
        <ScrollReveal delay={0.05}>
          <DayActivity />
        </ScrollReveal>
      </div>
    </>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

function RingProgress({ pct, used, limit, remaining }: { pct: number; used: number; limit: number; remaining: number }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="relative grid place-items-center">
      <svg width={180} height={180} viewBox="0 0 180 180" className="-rotate-90">
        <circle cx="90" cy="90" r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="14" fill="none" />
        <circle
          cx="90"
          cy="90"
          r={r}
          stroke="#2a9fff"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-3xl  tracking-tight">{remaining}</div>
          <div className="text-[11px] text-white/60 mt-0.5">из {limit} осталось</div>
          <div className="text-[11px] text-white/50 mt-2">использовано: {used}</div>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case "ACTIVE":
      return <Tag tone="success">Активна</Tag>;
    case "EXPIRED":
      return <Tag tone="muted">Истекла</Tag>;
    case "CANCELLED":
      return <Tag tone="warning">Аннулирована</Tag>;
    case "REVOKED":
      return <Tag tone="danger">Отозвана</Tag>;
    case "DRAFT":
      return <Tag tone="neutral">Черновик</Tag>;
    default:
      return <Tag tone="neutral">{status}</Tag>;
  }
}
