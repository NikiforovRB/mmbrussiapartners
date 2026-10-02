import Link from "next/link";
import { ListChecks, X } from "lucide-react";
import { db } from "@/lib/db";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { formatRub } from "@/lib/money";
import { fioFromParts } from "@/lib/utils";
import {
  legacyRecordWhere,
  parseLegacyRecordFilter,
  type LegacyRecordFilter,
  type LegacyRecordTab,
} from "@/lib/legacy-records";
import { RecordFilters } from "./record-filters";
import { RecordsTable, type LegacyRecordRow } from "./records-table";

const PAGE_SIZE = 50;

const HINTS: Record<LegacyRecordTab, string> = {
  licenses:
    "Каждая лицензия из старого ЛК. Владелец на портале по умолчанию — представитель, к которому привязан дилер " +
    "старого ЛК. Отметьте лицензии (или все найденные по фильтру) и назначьте их другому представителю — вместе " +
    "с оплатами, которыми они погашены. Назначенное вручную повторный импорт и перепривязка дилера не меняют.",
  payments:
    "Оплаты из учёток субдилеров и внешние оплаты, которые вносил владелец ЛК. Внешняя оплата отнесена к дилеру, " +
    "чьи лицензии она погасила.",
  other: "Пароли HUMAX и приборных панелей, услуги, купоны и комментарии из старого ЛК.",
};

export async function LegacyRecordsView({
  tab,
  sp,
  canEdit,
}: {
  tab: LegacyRecordTab;
  sp: Record<string, string | undefined>;
  canEdit: boolean;
}) {
  const filter = parseLegacyRecordFilter(sp, tab);
  const where = legacyRecordWhere(filter);
  const page = parsePage(sp.page);

  const [total, sums, assigned, rows, dealer, user] = await Promise.all([
    db.legacyRecord.count({ where }),
    db.legacyRecord.aggregate({ where, _sum: { priceTotal: true } }),
    db.legacyRecord.count({ where: { AND: [where, { userId: { not: null } }] } }),
    db.legacyRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        legacyDealer: { select: { id: true, name: true, city: true, source: true } },
        user: {
          select: {
            id: true,
            email: true,
            dealerProfile: { select: { firstName: true, lastName: true, middleName: true } },
          },
        },
        assignedBy: { select: { email: true } },
      },
    }),
    filter.dealer && filter.dealer !== "none"
      ? db.legacyDealer.findUnique({ where: { id: filter.dealer }, select: { name: true, city: true } })
      : null,
    filter.user
      ? db.user.findUnique({
          where: { id: filter.user },
          select: { email: true, dealerProfile: { select: { firstName: true, lastName: true, middleName: true } } },
        })
      : null,
  ]);

  const paidIds = [...new Set(rows.map((r) => r.paidById).filter((id): id is string => Boolean(id)))];
  const payments = paidIds.length
    ? await db.legacyRecord.findMany({ where: { id: { in: paidIds } }, select: { id: true, createdAt: true } })
    : [];
  const paidAt = new Map(payments.map((p) => [p.id, p.createdAt.toISOString()]));

  const items: LegacyRecordRow[] = rows.map((r) => ({
    id: r.id,
    lkType: r.lkType,
    createdAt: r.createdAt.toISOString(),
    licenseType: r.licenseType,
    product: r.product,
    bundle: r.bundle,
    region: r.region,
    version: r.version,
    versionCustom: r.versionCustom,
    eolType: r.eolType,
    priceTotal: r.priceTotal == null ? null : Number(r.priceTotal),
    priceLk: r.priceLk == null ? null : Number(r.priceLk),
    paymentStatus: r.paymentStatus,
    dealerComment: r.dealerComment,
    authorName: r.authorName,
    paidAt: r.paidById ? (paidAt.get(r.paidById) ?? null) : null,
    paidItems: r.paidItems,
    legacyDealer: r.legacyDealer
      ? { id: r.legacyDealer.id, label: [r.legacyDealer.name, r.legacyDealer.city].filter(Boolean).join(", ") }
      : null,
    user: r.user
      ? { id: r.user.id, label: (r.user.dealerProfile && fioFromParts(r.user.dealerProfile)) || r.user.email }
      : null,
    manualAssign: r.manualAssign,
    assignedAt: r.assignedAt?.toISOString() ?? null,
    assignedBy: r.assignedBy?.email ?? null,
  }));

  const query = (patch: Partial<LegacyRecordFilter>) => {
    const next = { ...filter, ...patch };
    const params = new URLSearchParams({ tab });
    for (const key of ["q", "owner", "pay", "dealer", "user"] as const) {
      const v = next[key];
      if (v) params.set(key, v);
    }
    return `/admin/legacy-dealers?${params.toString()}`;
  };
  const chips = [
    filter.dealer
      ? {
          label: `Дилер старого ЛК: ${
            filter.dealer === "none" ? "не определён" : [dealer?.name, dealer?.city].filter(Boolean).join(", ") || "—"
          }`,
          clear: query({ dealer: undefined }),
        }
      : null,
    filter.user
      ? {
          label: `Представитель: ${(user?.dealerProfile && fioFromParts(user.dealerProfile)) || user?.email || "—"}`,
          clear: query({ user: undefined }),
        }
      : null,
  ].filter((c): c is { label: string; clear: string } => c !== null);

  return (
    <>
      <div className="mt-5 flex gap-3 rounded-panel bg-surface-muted px-4 py-3 text-sm text-ink-muted">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>{HINTS[tab]}</div>
      </div>

      <div className="mt-5">
        <RecordFilters
          key={tab}
          initialQuery={filter.q ?? ""}
          initialOwner={filter.owner ?? ""}
          initialPay={filter.pay ?? ""}
          showPay={tab !== "other"}
        />
      </div>

      {chips.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.clear}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
            >
              {c.label}
              <X className="h-3 w-3" />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-4 text-xs text-ink-muted">
        Найдено {total.toLocaleString("ru-RU")}
        {tab !== "other" ? ` на ${formatRub(Number(sums._sum.priceTotal ?? 0))}` : ""} · у представителей портала{" "}
        {assigned.toLocaleString("ru-RU")}
      </div>

      <RecordsTable key={JSON.stringify(filter) + page} rows={items} tab={tab} total={total} filter={filter} canEdit={canEdit} />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/legacy-dealers"
        query={{ tab, q: filter.q, owner: filter.owner, pay: filter.pay, dealer: filter.dealer, user: filter.user }}
      />
    </>
  );
}
