import Link from "next/link";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Button } from "@/components/ui/button";
import { ChevronRight, Search } from "lucide-react";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { cn, fioFromParts, plural } from "@/lib/utils";
import { isPublishedOnSite, PUBLISHED_ON_SITE_WHERE } from "@/lib/site-dealers";
import { SITE_PROBLEM_STATUSES } from "@/lib/site-sync-labels";
import type { DealerProfile, Role, User, UserStatus } from "@prisma/client";
import { DealersFilters } from "./dealers-filters";
import { DeleteDealerButton } from "./delete-dealer-button";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminDealersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; pub?: string; page?: string }>;
}) {
  const session = await requireAdminPage("dealers.view");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user) return null;

  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.status && ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(sp.status)) {
    where.status = sp.status;
  }
  if (sp.pub === "PENDING") {
    where.dealerProfile = { sitePublication: "PENDING", phoneVisibleOnSite: true };
  } else if (sp.pub === "PUBLISHED") {
    where.dealerProfile = PUBLISHED_ON_SITE_WHERE;
  } else if (sp.pub === "REJECTED") {
    where.dealerProfile = { sitePublication: "REJECTED" };
  }
  if (sp.q && sp.q.trim()) {
    // Каждое слово запроса должно найтись хоть в одном поле: «Рагим Москва»
    // находит Рагима из Москвы, а не всех Рагимов и всех москвичей.
    const words = sp.q.trim().split(/\s+/).slice(0, 6);
    where.AND = words.map((q) => {
      const text = { contains: q, mode: "insensitive" };
      const or: Record<string, unknown>[] = [
        { email: text },
        { dealerProfile: { firstName: text } },
        { dealerProfile: { lastName: text } },
        { dealerProfile: { middleName: text } },
        { dealerProfile: { organization: text } },
        { dealerProfile: { phone: { contains: q } } },
        { dealerProfile: { city: text } },
        { dealerProfile: { region: text } },
        { dealerProfile: { country: text } },
        { dealerProfile: { address: text } },
        { dealerProfile: { signupCity: text } },
        { dealerProfile: { signupCountry: text } },
      ];
      // Пустая страна у представителя означает Россию (так её видит и сайт).
      if (q.length >= 3 && "россия".startsWith(q.toLowerCase())) {
        or.push({ dealerProfile: { country: null } });
      }
      return { OR: or };
    });
  }

  const page = parsePage(sp.page);
  const [total, dealers, pendingPublications] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: { dealerProfile: true, role: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.dealerProfile.count({ where: { sitePublication: "PENDING", phoneVisibleOnSite: true } }),
  ]);

  const canDelete = hasPermission(user.role.permissions, "dealers.delete", user.isSuperAdmin);

  return (
    <>
      <Topbar
        title="Представители"
        subtitle="Одобрение заявок и управление дилерской сетью"
        user={{
          name: user.email,
          email: user.email,
          role: user.role.name,
        }}
      />
      <div className="mt-6">
        {pendingPublications > 0 && sp.pub !== "PENDING" ? (
          <Link
            href="/admin/dealers?pub=PENDING"
            className="mb-4 flex items-center justify-between gap-3 rounded-panel bg-[#fef3c7] px-4 py-3 text-sm text-[#a16207] transition-opacity hover:opacity-90"
          >
            <span>
              {pendingPublications}{" "}
              {plural(pendingPublications, ["заявка", "заявки", "заявок"])} на публикацию телефона на сайте
            </span>
            <span className="flex items-center gap-1 text-xs">
              Посмотреть <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        ) : null}
        <DealersFilters
          initialQuery={sp.q ?? ""}
          initialStatus={sp.status ?? ""}
          initialPublication={sp.pub ?? ""}
        />
        <div className="mt-5 rounded-panel border border-hairline overflow-hidden">
          {dealers.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-ink-muted">Ничего не найдено</div>
          ) : null}

          {/* До lg — карточки: таблица из шести колонок в узкий экран не влезает. */}
          <ul className="lg:hidden divide-y divide-hairline">
            {dealers.map((u) => {
              const row = dealerRow(u);
              const deletable = canDelete && isDeletable(u, user.id);
              return (
                <li key={u.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/dealers/${u.id}`} className="min-w-0">
                      <div className="truncate font-medium hover:text-accent">{row.fio || u.email}</div>
                      {row.organization ? (
                        <div className="truncate text-xs text-ink-muted">{row.organization}</div>
                      ) : null}
                    </Link>
                    <StatusTag kind="user" status={u.status} />
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-ink-muted">
                    <div className="break-all">
                      {u.email}
                      {u.dealerProfile?.phone ? ` · ${u.dealerProfile.phone}` : ""}
                    </div>
                    {row.place ? <div>{row.place}</div> : null}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-ink-muted">
                      Лимит {u.dealerProfile?.licensesUsed ?? 0} / {u.dealerProfile?.licenseLimit ?? 0}
                    </span>
                    <PublicationTag status={u.status} profile={u.dealerProfile} />
                    {u.dealerProfile?.legacyDealer ? <Tag tone="accent">Старый ЛК</Tag> : null}
                    <div className="ml-auto flex items-center gap-1">
                      <Link href={`/admin/dealers/${u.id}`}>
                        <Button size="sm" variant="ghost" iconRight={<ChevronRight className="h-4 w-4" />}>
                          Открыть
                        </Button>
                      </Link>
                      {deletable ? <DeleteDealerButton dealerId={u.id} name={row.fio || u.email} compact /> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <table className={cn("hidden w-full table-fixed text-sm", dealers.length > 0 && "lg:table")}>
            <colgroup>
              <col className="w-[23%]" />
              <col className="w-[25%]" />
              <col className="w-[17%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[88px]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                <th className="px-3 py-3">Представитель</th>
                <th className="px-3 py-3">Контакты</th>
                <th className="px-3 py-3">Регион</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3">Лимит</th>
                <th className="px-3 py-3">Публикация</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {dealers.map((u) => {
                const row = dealerRow(u);
                const deletable = canDelete && isDeletable(u, user.id);
                return (
                  <tr key={u.id} className="border-t border-hairline align-top transition-colors hover:bg-surface-muted">
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/dealers/${u.id}`}
                        className="block truncate hover:text-accent"
                        title={row.fio || u.email}
                      >
                        {row.fio || "—"}
                      </Link>
                      <div className="truncate text-xs text-ink-muted" title={row.organization ?? undefined}>
                        {row.organization ?? "—"}
                      </div>
                      {u.dealerProfile?.legacyDealer ? (
                        <Tag tone="accent" className="mt-1 px-2 py-0.5 text-[11px]">
                          Старый ЛК
                        </Tag>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-muted">
                      <div className="truncate" title={u.email}>
                        {u.email}
                      </div>
                      <div className="truncate">{u.dealerProfile?.phone}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-muted">
                      <div className="truncate" title={row.place ?? undefined}>
                        {u.dealerProfile?.city ?? "—"}
                      </div>
                      {row.regionLine ? <div className="truncate">{row.regionLine}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <StatusTag kind="user" status={u.status} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {u.dealerProfile?.licensesUsed ?? 0} / {u.dealerProfile?.licenseLimit ?? 0}
                    </td>
                    <td className="px-3 py-3">
                      <PublicationTag status={u.status} profile={u.dealerProfile} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/dealers/${u.id}`} title="Открыть">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-9 px-0"
                            aria-label={`Открыть ${row.fio || u.email}`}
                            icon={<ChevronRight className="h-4 w-4" />}
                          />
                        </Link>
                        {deletable ? (
                          <DeleteDealerButton dealerId={u.id} name={row.fio || u.email} compact />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/admin/dealers"
          query={{ q: sp.q, status: sp.status, pub: sp.pub }}
        />
      </div>
    </>
  );
}

type DealerListUser = User & { dealerProfile: DealerProfile | null; role: Role };

function dealerRow(u: DealerListUser) {
  const p = u.dealerProfile;
  const fio = fioFromParts({ firstName: p?.firstName, lastName: p?.lastName, middleName: p?.middleName });
  const regionLine = [p?.region, p?.country].filter(Boolean).join(" · ") || null;
  const place = [p?.city, p?.region, p?.country].filter(Boolean).join(" · ") || null;
  return { fio, organization: p?.organization ?? null, regionLine, place };
}

function isDeletable(u: DealerListUser, meId: string) {
  return u.id !== meId && !u.isSuperAdmin && !hasAdminScope(u.role.permissions);
}

function PublicationTag({
  status,
  profile,
}: {
  status: UserStatus;
  profile: DealerProfile | null;
}) {
  if (!profile) return <Tag tone="muted">—</Tag>;
  if (isPublishedOnSite(status, profile)) {
    return profile.siteSyncStatus && SITE_PROBLEM_STATUSES.includes(profile.siteSyncStatus) ? (
      <Tag tone="danger" title={profile.siteSyncMessage ?? undefined}>
        Ошибка отправки
      </Tag>
    ) : (
      <Tag tone="success">На сайте</Tag>
    );
  }
  if (!profile.phoneVisibleOnSite) return <Tag tone="muted">Скрыт</Tag>;
  if (profile.sitePublication === "PENDING") return <Tag tone="warning">Заявка</Tag>;
  if (profile.sitePublication === "REJECTED") return <Tag tone="danger">Отклонена</Tag>;
  if (profile.sitePublication === "APPROVED") return <Tag tone="muted">Учётка неактивна</Tag>;
  return <Tag tone="muted">Скрыт</Tag>;
}

void Search;
