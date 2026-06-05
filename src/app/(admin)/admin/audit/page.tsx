import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { History } from "lucide-react";
import Link from "next/link";
import { formatRuDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [me, logs] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.licenseAuditLog.findMany({
      include: {
        actor: true,
        license: { select: { number: true, id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
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
          <ul className="space-y-2.5">
            {logs.map((l) => (
              <li key={l.id} className="rounded-panel bg-white p-3.5 flex items-start justify-between gap-4">
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
