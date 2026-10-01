import { redirect } from "next/navigation";
import { History, Search } from "lucide-react";
import type { LegacyRecordKind, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { LinkTabs } from "@/components/ui/link-tabs";
import { formatRuDate, formatRuDateLong, formatRuDateTime } from "@/lib/dates";
import { formatRub } from "@/lib/money";
import { fioFromParts, plural } from "@/lib/utils";
import { LEGACY_PAYMENT_LABEL, LK_TYPE_LABEL, legacyPaymentTone, legacyPosition } from "@/lib/legacy-labels";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const TABS = {
  licenses: { label: "Лицензии", kinds: ["LICENSE"] },
  payments: { label: "Оплаты", kinds: ["PAYMENT"] },
  other: { label: "Пароли и услуги", kinds: ["PASSWORD", "SERVICE"] },
} satisfies Record<string, { label: string; kinds: LegacyRecordKind[] }>;
type Tab = keyof typeof TABS;

const th = "px-3 py-2.5 text-left text-xs font-normal text-ink-muted whitespace-nowrap";
const td = "px-3 py-2.5 align-top";

export default async function DealerLegacyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/login");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "payments" || sp.tab === "other" ? sp.tab : "licenses";
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const page = parsePage(sp.page);

  const mine: Prisma.LegacyRecordWhereInput = { userId: user.id };
  const where: Prisma.LegacyRecordWhereInput = { ...mine, kind: { in: TABS[tab].kinds } };
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length) {
    where.AND = words.map((w) => {
      const text = { contains: w, mode: "insensitive" as const };
      return {
        OR: [{ dealerComment: text }, { product: text }, { bundle: text }, { version: text }, { versionCustom: text }],
      };
    });
  }

  const [kinds, licenseTotals, paymentTotals, range, total, rows] = await Promise.all([
    db.legacyRecord.groupBy({ by: ["kind"], where: mine, _count: true }),
    db.legacyRecord.groupBy({
      by: ["paymentStatus"],
      where: { ...mine, kind: "LICENSE" },
      _count: true,
      _sum: { priceTotal: true },
    }),
    db.legacyRecord.aggregate({ where: { ...mine, kind: "PAYMENT", paymentStatus: "PAID" }, _sum: { priceTotal: true } }),
    db.legacyRecord.aggregate({ where: { ...mine, kind: "LICENSE" }, _min: { createdAt: true }, _max: { createdAt: true } }),
    db.legacyRecord.count({ where }),
    db.legacyRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const paidIds = [...new Set(rows.map((r) => r.paidById).filter((id): id is string => Boolean(id)))];
  const paidAt = new Map(
    (paidIds.length
      ? await db.legacyRecord.findMany({ where: { id: { in: paidIds }, userId: user.id }, select: { id: true, createdAt: true } })
      : []
    ).map((p) => [p.id, p.createdAt]),
  );

  const kindCount = (...k: LegacyRecordKind[]) => kinds.filter((x) => k.includes(x.kind)).reduce((s, x) => s + x._count, 0);
  const licenses = kindCount("LICENSE");
  const sum = (status?: string) =>
    licenseTotals
      .filter((t) => !status || t.paymentStatus === status)
      .reduce((s, t) => s + Number(t._sum.priceTotal ?? 0), 0);
  const unpaid = sum() - sum("PAID");
  const unpaidCount = licenseTotals.filter((t) => t.paymentStatus !== "PAID").reduce((s, t) => s + t._count, 0);

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Старый ЛК DriveMods"
        subtitle="Лицензии и оплаты из store.drivemods.ru — только для просмотра"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />

      {kinds.length === 0 ? (
        <Card className="mt-6 p-8 text-center text-sm text-ink-muted">
          Записей из старого личного кабинета DriveMods у вас нет. Если вы работали там — напишите MMB RUSSIA, мы
          перенесём историю.
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Лицензий"
              value={licenses.toLocaleString("ru-RU")}
              hint={unpaidCount ? `не оплачено ${unpaidCount}` : "все оплачены"}
            />
            <Kpi label="На сумму" value={formatRub(sum())} hint={unpaid > 0 ? `не оплачено ${formatRub(unpaid)}` : undefined} />
            <Kpi
              label="Оплачено"
              value={formatRub(Number(paymentTotals._sum.priceTotal ?? 0))}
              hint={`${kindCount("PAYMENT")} ${plural(kindCount("PAYMENT"), ["оплата", "оплаты", "оплат"])}`}
            />
            <Kpi
              label="Период"
              value={range._min.createdAt ? formatRuDate(range._min.createdAt) : "—"}
              hint={range._max.createdAt ? `по ${formatRuDateLong(range._max.createdAt)}` : undefined}
            />
          </div>

          <div className="mt-4 flex gap-3 rounded-panel bg-surface-muted px-4 py-3 text-sm text-ink-muted">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              История перенесена из прежнего личного кабинета DriveMods и не меняется. Новые лицензии — в разделе
              «Мои лицензии».
            </div>
          </div>

          <LinkTabs
            className="mt-5"
            label="Записи старого ЛК"
            tabs={(Object.keys(TABS) as Tab[])
              .filter((t) => t === "licenses" || kindCount(...TABS[t].kinds) > 0)
              .map((t) => ({
                href: t === "licenses" ? "/dealer/legacy" : `/dealer/legacy?tab=${t}`,
                label: TABS[t].label,
                active: tab === t,
                count: kindCount(...TABS[t].kinds),
              }))}
          />

          <form className="mt-4" action="/dealer/legacy">
            {tab !== "licenses" ? <input type="hidden" name="tab" value={tab} /> : null}
            <label className="flex h-12 items-center gap-2 rounded-panel border border-hairline bg-white px-4 transition-colors focus-within:border-accent">
              <Search className="h-4 w-4 text-ink-subtle" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Комментарий, продукт, версия… и Enter"
                className="w-full bg-transparent text-sm placeholder:text-ink-subtle"
              />
            </label>
          </form>

          <div className="mt-3 overflow-x-auto rounded-panel border border-hairline bg-white">
            {rows.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-ink-muted">Ничего не найдено</div>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-hairline bg-surface-muted/60">
                  <tr>
                    <th className={th}>Дата</th>
                    <th className={th}>{tab === "payments" ? "Оплата" : tab === "licenses" ? "Лицензия" : "Запись"}</th>
                    {tab !== "payments" ? <th className={th}>Комментарий</th> : null}
                    <th className={`${th} text-right`}>Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((r) => {
                    const paid = r.paidById ? paidAt.get(r.paidById) : undefined;
                    const price = r.priceTotal == null ? null : Number(r.priceTotal);
                    return (
                      <tr key={r.id}>
                        <td className={`${td} whitespace-nowrap`}>{formatRuDateTime(r.createdAt)}</td>
                        <td className={td}>
                          {tab === "payments" ? (
                            <>
                              <div>{LK_TYPE_LABEL[r.lkType] ?? "Оплата"}</div>
                              {r.paidItems != null ? (
                                <div className="text-xs text-ink-muted">
                                  погашено {r.paidItems} {plural(r.paidItems, ["позиция", "позиции", "позиций"])}
                                </div>
                              ) : null}
                            </>
                          ) : tab === "licenses" ? (
                            <>
                              <div>{legacyPosition(r)}</div>
                              <div className="text-xs text-ink-muted">
                                {[
                                  r.licenseType,
                                  r.version,
                                  r.versionCustom ? `кастом ${r.versionCustom}` : null,
                                  r.eolType ? `EOL ${r.eolType}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </div>
                            </>
                          ) : (
                            <div>
                              {LK_TYPE_LABEL[r.lkType] ?? "Запись"}
                              {r.product ? ` · ${r.product}` : ""}
                            </div>
                          )}
                        </td>
                        {tab !== "payments" ? (
                          <td className={`${td} max-w-[320px]`}>
                            <div className="truncate" title={r.dealerComment ?? undefined}>
                              {r.dealerComment || <span className="text-ink-subtle">—</span>}
                            </div>
                          </td>
                        ) : null}
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {price != null && (price > 0 || tab !== "other") ? <div>{formatRub(price)}</div> : null}
                          {tab !== "other" || (price ?? 0) > 0 ? (
                            <Tag tone={legacyPaymentTone(r.paymentStatus)} className="mt-1 px-2 py-0.5 text-[11px]">
                              {LEGACY_PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}
                            </Tag>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                          {paid ? <div className="mt-1 text-[11px] text-ink-subtle">оплата {formatRuDate(paid)}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/dealer/legacy"
            query={{ tab: tab === "licenses" ? undefined : tab, q: q || undefined }}
          />
        </>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 font-display text-2xl tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-subtle">{hint}</div> : null}
    </Card>
  );
}
