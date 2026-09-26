import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Button } from "@/components/ui/button";
import { ChevronRight, Search } from "lucide-react";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { fioFromParts, plural } from "@/lib/utils";
import { isPublishedOnSite, PUBLISHED_ON_SITE_WHERE } from "@/lib/site-dealers";
import { SITE_PROBLEM_STATUSES } from "@/lib/site-sync-labels";
import type { DealerProfile, UserStatus } from "@prisma/client";
import { DealersFilters } from "./dealers-filters";
import { DeleteDealerButton } from "./delete-dealer-button";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminDealersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; pub?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
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
    const q = sp.q.trim();
    Object.assign(where, {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { dealerProfile: { firstName: { contains: q, mode: "insensitive" } } },
        { dealerProfile: { lastName: { contains: q, mode: "insensitive" } } },
        { dealerProfile: { middleName: { contains: q, mode: "insensitive" } } },
        { dealerProfile: { organization: { contains: q, mode: "insensitive" } } },
        { dealerProfile: { phone: { contains: q } } },
      ],
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
          <div className="overflow-x-auto scrollbar-clean">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                  <th className="px-4 py-3">Представитель</th>
                  <th className="px-4 py-3">Контакты</th>
                  <th className="px-4 py-3">Регион</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Лимит</th>
                  <th className="px-4 py-3">Публикация</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {dealers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                      Ничего не найдено
                    </td>
                  </tr>
                ) : null}
                {dealers.map((u) => {
                  const fio = fioFromParts({
                    firstName: u.dealerProfile?.firstName,
                    lastName: u.dealerProfile?.lastName,
                    middleName: u.dealerProfile?.middleName,
                  });
                  const deletable =
                    canDelete &&
                    u.id !== user.id &&
                    !u.isSuperAdmin &&
                    !hasAdminScope(u.role.permissions);
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <div>{fio || "—"}</div>
                        <div className="text-xs text-ink-muted">{u.dealerProfile?.organization ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        <div>{u.email}</div>
                        <div>{u.dealerProfile?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {u.dealerProfile?.city ?? "—"}
                        {u.dealerProfile?.region ? ` · ${u.dealerProfile.region}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag kind="user" status={u.status} />
                      </td>
                      <td className="px-4 py-3 ">
                        {u.dealerProfile?.licensesUsed ?? 0} / {u.dealerProfile?.licenseLimit ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <PublicationTag status={u.status} profile={u.dealerProfile} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/dealers/${u.id}`}>
                            <Button size="sm" variant="ghost" iconRight={<ChevronRight className="h-4 w-4" />}>
                              Открыть
                            </Button>
                          </Link>
                          {deletable ? (
                            <DeleteDealerButton dealerId={u.id} name={fio || u.email} compact />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
