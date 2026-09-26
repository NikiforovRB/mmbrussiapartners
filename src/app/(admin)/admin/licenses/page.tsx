import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { LicenseTable } from "@/components/licenses/license-table";
import { LICENSE_LIST_SELECT, toLicenseRow } from "@/lib/license-list";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { requireAdminPage } from "@/lib/session";
import { LICENSE_STATUSES } from "@/lib/status-labels";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminLicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; page?: string }>;
}) {
  const session = await requireAdminPage("licenses.view");
  const sp = await searchParams;
  const where = buildWhere(sp);
  const page = parsePage(sp.page);

  const [total, licenses, me] = await Promise.all([
    db.license.count({ where }),
    db.license.findMany({
      where,
      select: LICENSE_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    }),
  ]);

  return (
    <>
      <Topbar
        title="Все лицензии"
        subtitle="Поиск, редактирование, аннулирование"
        user={{
          name: me?.email ?? "Admin",
          email: me?.email ?? "",
          role: me?.role.name ?? "Admin",
        }}
      />
      <div className="mt-6">
        <LicenseTable
          licenses={licenses.map(toLicenseRow)}
          basePath="/admin/licenses"
          context="admin"
          initialQuery={sp.q ?? ""}
          initialStatus={sp.status ?? ""}
          initialType={sp.type ?? ""}
          actions={
            hasPermission(session.user.permissions, "licenses.create", session.user.isSuperAdmin) ? (
              <Link href="/admin/licenses/new">
                <Button icon={<Plus className="h-4 w-4" />}>Новая лицензия</Button>
              </Link>
            ) : null
          }
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/admin/licenses"
          query={{ q: sp.q, status: sp.status, type: sp.type }}
        />
      </div>
    </>
  );
}

function buildWhere(sp: { q?: string; status?: string; type?: string }) {
  const where: Record<string, unknown> = { deletedAt: null };
  if (sp.status && (LICENSE_STATUSES as readonly string[]).includes(sp.status)) {
    where.status = sp.status;
  }
  // Тип фильтра — синтетический: «Повторная генерация» это флаг, а не поле type.
  if (sp.type === "repeat") where.repeatGeneration = true;
  else if (sp.type === "gen") where.repeatGeneration = false;
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    Object.assign(where, {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { product: { contains: q, mode: "insensitive" } },
        { dealerComment: { contains: q, mode: "insensitive" } },
        { versionSoftware: { contains: q, mode: "insensitive" } },
        { dealer: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return where;
}
