import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { History } from "lucide-react";
import Link from "next/link";
import { formatRuDateTime } from "@/lib/dates";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

/** Две ленты: по лицензиям и по всему остальному администрированию. */
const TABS = [
  { id: "licenses", label: "Лицензии" },
  { id: "admin", label: "Администрирование" },
] as const;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const tab = sp.tab === "admin" ? "admin" : "licenses";
  const skip = (page - 1) * PAGE_SIZE;

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const [total, licenseLogs, adminLogs] =
    tab === "licenses"
      ? await Promise.all([
          db.licenseAuditLog.count(),
          db.licenseAuditLog.findMany({
            include: { actor: { select: { email: true } }, license: { select: { number: true, id: true } } },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
          }),
          Promise.resolve([]),
        ])
      : await Promise.all([
          db.adminAuditLog.count(),
          Promise.resolve([]),
          db.adminAuditLog.findMany({
            include: { actor: { select: { email: true } } },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
          }),
        ]);

  const isEmpty = tab === "licenses" ? licenseLogs.length === 0 : adminLogs.length === 0;

  return (
    <>
      <Topbar
        title="Журнал аудита"
        subtitle={tab === "licenses" ? "Действия с лицензиями" : "Представители, роли, платежи и настройки"}
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-accent" />
              <div className="font-display  tracking-tight">События</div>
            </div>
            <div className="flex items-center gap-1 rounded-panel bg-surface-muted p-1">
              {TABS.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/audit?tab=${t.id}`}
                  className={cn(
                    "rounded-btn px-3.5 py-1.5 text-sm transition-colors",
                    tab === t.id ? "bg-white text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>

          {isEmpty ? (
            <div className="text-sm text-ink-muted py-10 text-center">Событий пока нет</div>
          ) : (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {tab === "licenses"
                ? licenseLogs.map((l) => (
                    <li key={l.id} className="py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tag tone={licenseTone(l.action)}>{licenseLabel(l.action)}</Tag>
                        <Link href={`/admin/licenses/${l.license.id}`} className=" hover:text-accent">
                          {l.license.number}
                        </Link>
                      </div>
                      <div className="text-xs text-ink-muted mt-1.5">
                        {l.actor.email} · {formatRuDateTime(l.createdAt)}
                      </div>
                      {l.reason ? <div className="text-sm mt-1.5 text-ink">{l.reason}</div> : null}
                    </li>
                  ))
                : adminLogs.map((l) => (
                    <li key={l.id} className="py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tag tone="accent">{ENTITY_LABEL[l.entity] ?? l.entity}</Tag>
                        <span className="text-sm">{ACTION_LABEL[l.action] ?? l.action}</span>
                        {l.entity === "DEALER" ? (
                          <Link href={`/admin/dealers/${l.entityId}`} className="text-sm hover:text-accent">
                            {l.summary ?? l.entityId}
                          </Link>
                        ) : l.summary ? (
                          <span className="text-sm text-ink-muted">{l.summary}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-ink-muted mt-1.5">
                        {l.actor.email} · {formatRuDateTime(l.createdAt)}
                      </div>
                      {l.diff ? (
                        <pre className="mt-2 overflow-x-auto rounded-panel bg-surface-muted px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
                          {JSON.stringify(l.diff, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  ))}
            </ul>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/audit"
            query={{ tab }}
          />
        </Card>
      </div>
    </>
  );
}

const ENTITY_LABEL: Record<string, string> = {
  DEALER: "Представитель",
  ROLE: "Роль",
  PAYMENT: "Платёж",
  SETTINGS: "Настройки",
};

const ACTION_LABEL: Record<string, string> = {
  CREATED: "создана",
  UPDATED: "обновлено",
  DELETED: "удалена",
  PROFILE_UPDATED: "профиль обновлён",
  ROLE_CHANGED: "роль изменена",
  STATUS_APPROVED: "одобрен",
  STATUS_REJECTED: "отклонён",
  STATUS_SUSPENDED: "заблокирован",
  STATUS_PENDING: "возвращён на рассмотрение",
  CONFIRMED: "оплата подтверждена",
  CANCELLED: "отменён",
  FISCALIZED: "чек отправлен в кассу",
};

function licenseLabel(a: string) {
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

function licenseTone(a: string): "neutral" | "accent" | "warning" | "danger" | "success" | "muted" {
  switch (a) {
    case "CREATED":
    case "RESTORED":
      return "success";
    case "EDITED":
      return "accent";
    case "CANCELLED":
      return "warning";
    case "REVOKED":
    case "DELETED":
      return "danger";
    case "EXPIRED":
      return "muted";
    default:
      return "neutral";
  }
}
