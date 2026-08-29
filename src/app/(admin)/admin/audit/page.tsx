import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { History } from "lucide-react";
import Link from "next/link";
import { formatRuDateTime } from "@/lib/dates";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sp = await searchParams;
  const page = parsePage(sp.page);

  const [me, total, logs] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.licenseAuditLog.count(),
    db.licenseAuditLog.findMany({
      include: {
        actor: true,
        license: { select: { number: true, id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <>
      <Topbar
        title="Журнал аудита"
        subtitle="Все действия с лицензиями"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-accent" />
            <div className="font-display  tracking-tight">События</div>
          </div>
          {logs.length === 0 ? (
            <div className="text-sm text-ink-muted py-10 text-center">Событий пока нет</div>
          ) : null}
          <ul className="divide-y divide-hairline border-t border-hairline">
            {logs.map((l) => (
              <li key={l.id} className="py-3.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Tag tone={tone(l.action)}>{label(l.action)}</Tag>
                    <Link href={`/admin/licenses/${l.license.id}`} className=" hover:text-accent">
                      {l.license.number}
                    </Link>
                  </div>
                  <div className="text-xs text-ink-muted mt-1.5">
                    {l.actor.email} · {formatRuDateTime(l.createdAt)}
                  </div>
                  {l.reason ? <div className="text-sm mt-1.5 text-ink">{l.reason}</div> : null}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/audit" />
        </Card>
      </div>
    </>
  );
}

function label(a: string) {
  switch (a) {
    case "CREATED":
      return "Создана";
    case "EDITED":
      return "Изменена";
    case "CANCELLED":
      return "Аннулирована";
    case "REVOKED":
      return "Отозвана";
    case "DELETED":
      return "Удалена";
    case "RESTORED":
      return "Восстановлена";
    case "EXPIRED":
      return "Истекла";
    default:
      return a;
  }
}

function tone(a: string): "neutral" | "accent" | "warning" | "danger" | "success" | "muted" {
  switch (a) {
    case "CREATED":
      return "success";
    case "EDITED":
      return "accent";
    case "CANCELLED":
      return "warning";
    case "REVOKED":
      return "danger";
    case "DELETED":
      return "danger";
    case "RESTORED":
      return "success";
    case "EXPIRED":
      return "muted";
    default:
      return "neutral";
  }
}
