import Link from "next/link";
import { Download, History } from "lucide-react";
import { db, type Prisma } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { hasPermission } from "@/lib/permissions";
import { requireAdminPage } from "@/lib/session";
import { formatRuDateLong, formatRuDateTime } from "@/lib/dates";
import { formatRub } from "@/lib/money";
import { fioFromParts, plural } from "@/lib/utils";
import { LegacyFilters } from "./legacy-filters";
import { LegacyLinkButton, type LegacyCandidate } from "./legacy-link-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type ProductStat = { position: string; count: number; amount: number };
type CommentStat = { text: string; count: number };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/ё/g, "е").trim();
const phoneKey = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};

export default async function LegacyDealersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; link?: string; page?: string }>;
}) {
  const session = await requireAdminPage("dealers.view");
  const canEdit = hasPermission(session.user.permissions, "dealers.edit", session.user.isSuperAdmin);
  const sp = await searchParams;

  const where: Prisma.LegacyDealerWhereInput = {};
  if (sp.source === "account" || sp.source === "comment") where.source = sp.source;
  if (sp.link === "linked") where.userId = { not: null };
  else if (sp.link === "unlinked") where.userId = null;
  const words = (sp.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length) {
    where.AND = words.map((w) => {
      const text = { contains: w, mode: "insensitive" as const };
      const digits = w.replace(/\D/g, "");
      return {
        OR: [
          { name: text },
          { city: text },
          { country: text },
          { email: text },
          ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          { user: { email: text } },
        ],
      };
    });
  }

  const page = parsePage(sp.page);
  const [me, total, rows, summary, linkedCount, accounts, lastImport] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.legacyDealer.count({ where }),
    db.legacyDealer.findMany({
      where,
      orderBy: [{ licenses: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            dealerProfile: { select: { firstName: true, lastName: true, middleName: true, city: true } },
          },
        },
      },
    }),
    db.legacyDealer.aggregate({
      _count: true,
      _sum: { licenses: true, paidLicenses: true, amountTotal: true, amountUnpaid: true },
    }),
    db.legacyDealer.count({ where: { userId: { not: null } } }),
    db.legacyDealer.count({ where: { source: "account" } }),
    db.legacyDealer.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true } }),
  ]);

  // Подсказки для ручной привязки: то же имя и город либо тот же email/телефон.
  const unlinked = rows.filter((r) => !r.userId);
  const profiles = unlinked.length
    ? await db.dealerProfile.findMany({
        where: { user: { legacyDealer: null } },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          middleName: true,
          city: true,
          phone: true,
          user: { select: { email: true } },
        },
      })
    : [];
  const suggestionsFor = (r: (typeof rows)[number]): LegacyCandidate[] => {
    const first = norm(r.name).split(/[\s(]/)[0];
    const city = norm(r.city).slice(0, 5);
    const phone = phoneKey(r.phone);
    return profiles
      .filter((p) => {
        if (r.email && norm(p.user.email) === norm(r.email)) return true;
        if (phone && phoneKey(p.phone) === phone) return true;
        return first.length > 1 && city.length >= 3 && norm(p.firstName) === first && norm(p.city).slice(0, 5) === city;
      })
      .slice(0, 5)
      .map((p) => ({
        id: p.userId,
        email: p.user.email,
        fio: fioFromParts(p),
        city: p.city,
        phone: p.phone,
      }));
  };

  const totalLicenses = summary._sum.licenses ?? 0;
  const paidShare = totalLicenses ? Math.round(((summary._sum.paidLicenses ?? 0) / totalLicenses) * 100) : 0;

  return (
    <>
      <Topbar
        title="Старый ЛК DriveMods"
        subtitle={
          lastImport
            ? `Дилеры и статистика из store.drivemods.ru · выгрузка от ${formatRuDateTime(lastImport.importedAt)}`
            : "Дилеры и статистика из store.drivemods.ru"
        }
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
        rightSlot={
          summary._count > 0 ? (
            <a href="/api/legacy-dealers/export" download>
              <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}>
                Скачать XLSX
              </Button>
            </a>
          ) : null
        }
      />

      {summary._count === 0 ? (
        <Card className="mt-6 p-8 text-center text-sm text-ink-muted">
          Выгрузка ещё не загружена. Запустите на сервере <code>scripts/drivemods-lk-import.ts</code>.
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Дилеров"
              value={String(summary._count)}
              hint={`${accounts} ${plural(accounts, ["учётка", "учётки", "учёток"])} · ${summary._count - accounts} из комментариев`}
            />
            <Kpi label="Лицензий" value={totalLicenses.toLocaleString("ru-RU")} hint={`Оплачено ${paidShare}%`} />
            <Kpi
              label="Сумма"
              value={formatRub(Number(summary._sum.amountTotal ?? 0))}
              hint={`Не оплачено ${formatRub(Number(summary._sum.amountUnpaid ?? 0))}`}
            />
            <Kpi
              label="Есть на портале"
              value={`${linkedCount} из ${summary._count}`}
              hint="Первая генерация — по цене дилера"
            />
          </div>

          <div className="mt-4 flex gap-3 rounded-panel bg-surface-muted px-4 py-3 text-sm text-ink-muted">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              Представитель, привязанный к записи, считается дилером из старого ЛК: правило «первая генерация — по
              клиентской цене» к нему не применяется. Субдилеры со своей учёткой привязываются сами — по email или
              телефону при регистрации и одобрении. Клиентов общего кабинета (имя и город в комментарии к лицензии)
              привяжите вручную кнопкой «Привязать».
            </div>
          </div>

          <div className="mt-5">
            <LegacyFilters initialQuery={sp.q ?? ""} initialSource={sp.source ?? ""} initialLink={sp.link ?? ""} />
          </div>

          <div className="mt-5 overflow-hidden rounded-panel border border-hairline">
            {rows.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-ink-muted">Ничего не найдено</div>
            ) : (
              <ul className="divide-y divide-hairline">
                {rows.map((r) => {
                  const products = ((r.products as ProductStat[] | null) ?? []).slice(0, 8);
                  const comments = (r.comments as CommentStat[] | null) ?? [];
                  const label = [r.name, r.city].filter(Boolean).join(", ");
                  const linked: LegacyCandidate | null = r.user
                    ? {
                        id: r.user.id,
                        email: r.user.email,
                        fio: r.user.dealerProfile ? fioFromParts(r.user.dealerProfile) : "",
                        city: r.user.dealerProfile?.city ?? null,
                      }
                    : null;
                  const suggestions = linked ? [] : suggestionsFor(r);
                  return (
                    <li key={r.id} className="px-4 py-3.5">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{r.name}</span>
                            <Tag tone={r.source === "account" ? "accent" : "muted"} className="px-2 py-0.5 text-[11px]">
                              {r.source === "account" ? "Учётка ЛК" : "Из комментариев"}
                            </Tag>
                            {!r.active ? (
                              <Tag tone="muted" className="px-2 py-0.5 text-[11px]">
                                Отключена
                              </Tag>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-ink-muted">
                            {[r.city, r.country].filter(Boolean).join(", ") || "Город не указан"}
                            {r.email ? ` · ${r.email}` : ""}
                            {r.phone ? ` · +${r.phone}` : ""}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm">
                            {r.licenses.toLocaleString("ru-RU")} {plural(r.licenses, ["лицензия", "лицензии", "лицензий"])}
                          </div>
                          <div className="text-xs text-ink-muted">
                            {r.source === "account"
                              ? `сам ${r.viaAccount} · через кабинет ${r.viaComment}`
                              : `оплачено ${r.paidLicenses}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm">{formatRub(Number(r.amountTotal))}</div>
                          <div className="text-xs text-ink-muted">
                            {Number(r.amountUnpaid) > 0
                              ? `не оплачено ${formatRub(Number(r.amountUnpaid))}`
                              : "всё оплачено"}
                            {r.payments > 0 ? ` · пополнений ${r.payments}` : ""}
                          </div>
                        </div>
                        <div className="text-xs text-ink-muted">
                          {r.firstLicenseAt ? (
                            <>
                              <div>с {formatRuDateLong(r.firstLicenseAt)}</div>
                              <div>по {formatRuDateLong(r.lastLicenseAt)}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="min-w-0">
                          <LegacyLinkButton
                            legacyId={r.id}
                            label={label}
                            linked={linked}
                            suggestions={suggestions}
                            canEdit={canEdit}
                          />
                          {!linked && suggestions.length > 0 ? (
                            <div className="mt-1 truncate text-xs text-[#a16207]">
                              Похож: {suggestions.map((s) => s.fio || s.email).join(", ")}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {products.length || comments.length ? (
                        <details className="group mt-2">
                          <summary className="cursor-pointer list-none text-xs text-ink-subtle hover:text-accent">
                            <span className="group-open:hidden">Позиции и комментарии ▾</span>
                            <span className="hidden group-open:inline">Скрыть ▴</span>
                          </summary>
                          <div className="mt-2 grid gap-4 text-xs md:grid-cols-2">
                            <div>
                              <div className="mb-1 text-ink-subtle">Позиции</div>
                              <ul className="space-y-0.5">
                                {products.map((p) => (
                                  <li key={p.position} className="flex justify-between gap-3">
                                    <span className="truncate">{p.position}</span>
                                    <span className="shrink-0 text-ink-muted">
                                      {p.count} · {formatRub(p.amount)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="mb-1 text-ink-subtle">Как записан в комментариях</div>
                              <ul className="space-y-0.5">
                                {comments.map((c) => (
                                  <li key={c.text} className="flex justify-between gap-3">
                                    <span className="truncate">{c.text}</span>
                                    <span className="shrink-0 text-ink-muted">×{c.count}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/legacy-dealers"
            query={{ q: sp.q, source: sp.source, link: sp.link }}
          />
          <p className="mt-3 text-xs text-ink-subtle">
            Полная выгрузка со всеми лицензиями хранится вне сайта. Карточки представителей:{" "}
            <Link href="/admin/dealers" className="underline hover:text-accent">
              Представители
            </Link>
            .
          </p>
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
