import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { StatusTag } from "@/components/ui/status-tag";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { formatRuDateTime } from "@/lib/dates";
import { fioFromParts } from "@/lib/utils";
import { RequestActions } from "./request-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export default async function CancellationRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canReview =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.cancel", session.user.isSuperAdmin);
  if (!canReview) redirect("/admin");

  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number])
    ? (sp.status as (typeof STATUSES)[number])
    : "PENDING";
  const page = parsePage(sp.page);

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const where = { status };
  const [total, requests] = await Promise.all([
    db.cancellationRequest.count({ where }),
    db.cancellationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        license: true,
        requestedBy: { include: { dealerProfile: true } },
        reviewedBy: true,
      },
    }),
  ]);

  const tabs: { key: (typeof STATUSES)[number]; label: string }[] = [
    { key: "PENDING", label: "На рассмотрении" },
    { key: "APPROVED", label: "Одобренные" },
    { key: "REJECTED", label: "Отклонённые" },
  ];

  return (
    <>
      <Topbar
        title="Заявки на аннулирование"
        subtitle="Запросы представителей на аннулирование лицензий"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/admin/cancellation-requests?status=${t.key}`}
              className={`rounded-btn px-4 h-9 inline-flex items-center text-sm transition-colors ${
                status === t.key
                  ? "bg-accent text-white"
                  : "border border-hairline text-ink hover:border-accent hover:text-accent"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <Card>
          {requests.length === 0 ? (
            <div className="py-12 text-center text-ink-muted">
              <ClipboardList className="h-6 w-6 mx-auto text-ink-subtle" />
              <div className="mt-2 text-sm">Заявок в этой категории нет</div>
            </div>
          ) : (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {requests.map((r) => {
                const fio = fioFromParts({
                  firstName: r.requestedBy.dealerProfile?.firstName,
                  lastName: r.requestedBy.dealerProfile?.lastName,
                  middleName: r.requestedBy.dealerProfile?.middleName,
                });
                return (
                  <li key={r.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/admin/licenses/${r.licenseId}`}
                            className="font-display tracking-tight hover:text-accent"
                          >
                            {r.license.number}
                          </Link>
                          <Tag tone={r.license.type === "Генерация" ? "accent" : "neutral"}>{r.license.type}</Tag>
                          <StatusTag kind="request" status={r.status} />
                        </div>
                        <div className="text-xs text-ink-muted mt-1.5">
                          {fio || r.requestedBy.email} · {formatRuDateTime(r.createdAt)}
                        </div>
                        <div className="text-sm mt-2">{r.reason}</div>
                        {r.reviewNote ? (
                          <div className="text-xs text-ink-muted mt-1.5">
                            Комментарий: {r.reviewNote}
                            {r.reviewedBy ? ` (${r.reviewedBy.email})` : ""}
                          </div>
                        ) : null}
                      </div>
                      {r.status === "PENDING" ? <RequestActions id={r.id} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/cancellation-requests"
            query={{ status }}
          />
        </Card>
      </div>
    </>
  );
}

