import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { PageHeader } from "@/components/cabinet/page-header";
import { Button } from "@/components/ui/button";
import { LicenseTable } from "@/components/licenses/license-table";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { LICENSE_TYPES } from "@/lib/license-options";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminLicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const sp = await searchParams;
  const where = buildWhere(sp);
  const page = parsePage(sp.page);

  const [total, licenses, me] = await Promise.all([
    db.license.count({ where }),
    db.license.findMany({
      where,
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
        <PageHeader
          title="Лицензии"
          description="Глобальный список всех лицензий системы. Фильтрация и редактирование."
          actions={
            hasPermission(session.user.permissions, "licenses.create", session.user.isSuperAdmin) ? (
              <Link href="/admin/licenses/new">
                <Button icon={<Plus className="h-4 w-4" />}>Новая лицензия</Button>
              </Link>
            ) : null
          }
        />
        <LicenseTable
          licenses={licenses}
          basePath="/admin/licenses"
          context="admin"
          initialQuery={sp.q ?? ""}
          initialStatus={sp.status ?? ""}
          initialType={sp.type ?? ""}
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
  if (sp.status && ["ACTIVE", "EXPIRED", "CANCELLED", "REVOKED", "DRAFT"].includes(sp.status)) {
    where.status = sp.status;
  }
  if (sp.type && (LICENSE_TYPES as readonly string[]).includes(sp.type)) {
    where.type = sp.type;
  }
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    Object.assign(where, {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customerFio: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q } },
        { customerOrganization: { contains: q, mode: "insensitive" } },
        { dealer: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return where;
}
