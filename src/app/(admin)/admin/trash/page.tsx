import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { TrashRow } from "./trash-row";
import { formatRuDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AdminTrashPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [me, deleted] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.license.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: { dealer: true },
      take: 100,
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
        <Card>
          {deleted.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Корзина пуста</div>
          ) : (
            <div className="overflow-hidden rounded-panel bg-white">
              <table className="w-full text-sm">
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
                  {deleted.map((l, i) => (
                    <tr key={l.id} style={i > 0 ? { boxShadow: "inset 0 1px 0 #c1cbe1" } : undefined}>
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
        </Card>
      </div>
    </>
  );
}
