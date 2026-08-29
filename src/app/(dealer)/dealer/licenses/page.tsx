import { Topbar } from "@/components/cabinet/topbar";
import { PageHeader } from "@/components/cabinet/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { LicenseTable } from "@/components/licenses/license-table";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { LICENSE_TYPES } from "@/lib/license-options";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function DealerLicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) return null;

  const sp = await searchParams;
  const where = buildWhere(sp, user.id);
  const page = parsePage(sp.page);

  const [total, licenses] = await Promise.all([
    db.license.count({ where }),
    db.license.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
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
        <PageHeader
          title="Лицензии"
          description="Создавайте, редактируйте, аннулируйте и скачивайте лицензии."
          actions={
            <Link href="/dealer/licenses/new">
              <Button icon={<Plus className="h-4 w-4" />}>Новая лицензия</Button>
            </Link>
          }
        />
        <LicenseTable
          licenses={licenses}
          basePath="/dealer/licenses"
          context="dealer"
          initialQuery={sp.q ?? ""}
          initialStatus={sp.status ?? ""}
          initialType={sp.type ?? ""}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/dealer/licenses"
          query={{ q: sp.q, status: sp.status, type: sp.type }}
        />
      </div>
    </>
  );
}

function buildWhere(
  sp: { q?: string; status?: string; type?: string },
  dealerId: string,
) {
  const where: Record<string, unknown> = { dealerId, deletedAt: null };
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
      ],
    });
  }
  return where;
}
