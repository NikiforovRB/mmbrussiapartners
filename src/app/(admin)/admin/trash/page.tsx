import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { TrashRow } from "./trash-row";
import { formatRuDate } from "@/lib/dates";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminTrashPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const where = { deletedAt: { not: null } };

  const [me, total, deleted] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.license.count({ where }),
    db.license.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      include: { dealer: true },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <>
      <Topbar
        title="Корзина"
        subtitle="Удалённые лицензии можно восстановить"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <div className="rounded-panel border border-hairline overflow-hidden">
          {deleted.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Корзина пуста</div>
          ) : (
            <div className="overflow-x-auto scrollbar-clean">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11.5px] uppercase tracking-tight text-ink-subtle">
                    <th className="px-4 py-3">Номер</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Дилер</th>
                    <th className="px-4 py-3">Удалена</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {deleted.map((l) => (
                    <tr key={l.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3 ">{l.number}</td>
                      <td className="px-4 py-3">
                        <Tag tone="muted">{l.type}</Tag>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{l.dealer.email}</td>
                      <td className="px-4 py-3 text-ink-muted">
                        {l.deletedAt ? formatRuDate(l.deletedAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TrashRow id={l.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/trash" />
      </div>
    </>
  );
}
