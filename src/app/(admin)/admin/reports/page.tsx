import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { ReportsBuilder } from "@/components/reports/reports-builder";
import { loadDealerOptions, loadLicenseProducts } from "@/lib/dealer-options";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const session = await requireAdminPage("reports.view");
  const [me, dealers, products] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    }),
    loadDealerOptions(),
    loadLicenseProducts(),
  ]);

  return (
    <>
      <Topbar
        title="Отчёты"
        subtitle="Экспорт XLSX и аналитика"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <ReportsBuilder context="admin" dealers={dealers} products={products} />
      </div>
    </>
  );
}
