import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { LicenseTable } from "@/components/licenses/license-table";
import {
  LICENSE_LIST_SELECT,
  licenseListWhere,
  parseDealerIds,
  toLicenseRow,
  type LicenseListParams,
} from "@/lib/license-list";
import { loadDealerOptions, loadLicenseProducts } from "@/lib/dealer-options";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminLicensesPage({
  searchParams,
}: {
  searchParams: Promise<LicenseListParams>;
}) {
  const session = await requireAdminPage("licenses.view");
  const sp = await searchParams;
  const where = licenseListWhere(sp);
  const page = parsePage(sp.page);

  const [total, licenses, me, products, dealers] = await Promise.all([
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
    loadLicenseProducts(),
    loadDealerOptions(),
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
          initial={{
            q: sp.q ?? "",
            status: sp.status ?? "",
            type: sp.type ?? "",
            product: sp.product ?? "",
            dealers: parseDealerIds(sp.dealers),
          }}
          products={products}
          dealers={dealers}
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
          query={{ q: sp.q, status: sp.status, type: sp.type, product: sp.product, dealers: sp.dealers }}
        />
      </div>
    </>
  );
}
