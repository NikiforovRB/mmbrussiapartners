import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { LicenseTable } from "@/components/licenses/license-table";
import { LICENSE_LIST_SELECT, licenseListWhere, toLicenseRow, type LicenseListParams } from "@/lib/license-list";
import { loadLicenseProducts } from "@/lib/dealer-options";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function DealerLicensesPage({
  searchParams,
}: {
  searchParams: Promise<LicenseListParams>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) return null;

  const sp = await searchParams;
  const where = licenseListWhere(sp, user.id);
  const page = parsePage(sp.page);

  const [total, licenses, products] = await Promise.all([
    db.license.count({ where }),
    db.license.findMany({
      where,
      select: LICENSE_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    loadLicenseProducts(user.id),
  ]);

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Мои лицензии"
        subtitle="Все ваши выданные лицензии"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <LicenseTable
          licenses={licenses.map(toLicenseRow)}
          basePath="/dealer/licenses"
          context="dealer"
          initial={{
            q: sp.q ?? "",
            status: sp.status ?? "",
            type: sp.type ?? "",
            product: sp.product ?? "",
            dealers: [],
          }}
          products={products}
          actions={
            <Link href="/dealer/licenses/new">
              <Button icon={<Plus className="h-4 w-4" />}>Новая лицензия</Button>
            </Link>
          }
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/dealer/licenses"
          query={{ q: sp.q, status: sp.status, type: sp.type, product: sp.product }}
        />
      </div>
    </>
  );
}
