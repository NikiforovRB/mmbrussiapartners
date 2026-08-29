import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { PageHeader } from "@/components/cabinet/page-header";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChevronRight, Search } from "lucide-react";
import { fioFromParts } from "@/lib/utils";
import { DealersFilters } from "./dealers-filters";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminDealersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
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
  const [total, dealers] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: { dealerProfile: true, role: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

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
        <PageHeader
          title="Дилерская сеть"
          description="Просматривайте, одобряйте и редактируйте профили представителей."
        />
        <DealersFilters initialQuery={sp.q ?? ""} initialStatus={sp.status ?? ""} />
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
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={fio || u.email} size={36} />
                          <div>
                            <div className="">{fio || "—"}</div>
                            <div className="text-xs text-ink-muted">{u.dealerProfile?.organization ?? "—"}</div>
                          </div>
                        </div>
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
                        {u.dealerProfile?.phoneVisibleOnSite ? (
                          <Tag tone="success">На сайте</Tag>
                        ) : (
                          <Tag tone="muted">Скрыт</Tag>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/dealers/${u.id}`}>
                          <Button size="sm" variant="ghost" iconRight={<ChevronRight className="h-4 w-4" />}>
                            Открыть
                          </Button>
                        </Link>
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
          query={{ q: sp.q, status: sp.status }}
        />
      </div>
    </>
  );
}

void Search;
