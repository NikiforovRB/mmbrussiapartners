import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { PageHeader } from "@/components/cabinet/page-header";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
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
        <Card className="mt-5">
          <div className="overflow-x-auto scrollbar-clean rounded-panel bg-white">
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
                {dealers.map((u, i) => {
                  const fio = fioFromParts({
                    firstName: u.dealerProfile?.firstName,
                    lastName: u.dealerProfile?.lastName,
                    middleName: u.dealerProfile?.middleName,
                  });
                  return (
                    <tr key={u.id} style={i > 0 ? { boxShadow: "inset 0 1px 0 #c1cbe1" } : undefined}>
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
                        <StatusTag status={u.status} />
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
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/dealers"
            query={{ q: sp.q, status: sp.status }}
          />
        </Card>
      </div>
    </>
  );
}

function StatusTag({ status }: { status: string }) {
  switch (status) {
    case "APPROVED":
      return <Tag tone="success">Одобрен</Tag>;
    case "PENDING":
      return <Tag tone="warning">Ожидает</Tag>;
    case "REJECTED":
      return <Tag tone="danger">Отклонён</Tag>;
    case "SUSPENDED":
      return <Tag tone="muted">Заблокирован</Tag>;
    default:
      return <Tag tone="neutral">{status}</Tag>;
  }
}

void Search;
