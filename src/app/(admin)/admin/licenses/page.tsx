import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { PageHeader } from "@/components/cabinet/page-header";
import { LicenseTable } from "@/components/licenses/license-table";

export const dynamic = "force-dynamic";

export default async function AdminLicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const sp = await searchParams;
  const where = buildWhere(sp);

  const [licenses, me] = await Promise.all([
    db.license.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
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
        />
        <LicenseTable
          licenses={licenses}
          basePath="/admin/licenses"
          context="admin"
          initialQuery={sp.q ?? ""}
          initialStatus={sp.status ?? ""}
          initialType={sp.type ?? ""}
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
  if (sp.type && ["ECO", "FULL", "CUSTOM"].includes(sp.type)) {
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
