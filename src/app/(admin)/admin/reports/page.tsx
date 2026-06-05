import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { ReportsBuilder } from "@/components/reports/reports-builder";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  return (
    <>
      <Topbar
        title="Отчёты"
        subtitle="Экспорт XLSX и аналитика"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <ReportsBuilder context="admin" />
      </div>
    </>
  );
}
