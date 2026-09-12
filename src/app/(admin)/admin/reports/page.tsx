import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { ReportsBuilder, type ReportDealerOption } from "@/components/reports/reports-builder";
import { fioFromParts } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  // Список представителей для мультивыбора в фильтре отчёта.
  const dealerUsers = await db.user.findMany({
    where: { dealerProfile: { isNot: null } },
    include: { dealerProfile: true },
    orderBy: { createdAt: "desc" },
  });
  const dealers: ReportDealerOption[] = dealerUsers.map((u) => {
    const fio = fioFromParts({
      firstName: u.dealerProfile?.firstName,
      lastName: u.dealerProfile?.lastName,
      middleName: u.dealerProfile?.middleName,
    });
    return {
      id: u.id,
      label: fio || u.email,
      sub: [u.dealerProfile?.organization, u.dealerProfile?.city].filter(Boolean).join(" · ") || u.email,
    };
  });

  return (
    <>
      <Topbar
        title="Отчёты"
        subtitle="Экспорт XLSX и аналитика"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <ReportsBuilder context="admin" dealers={dealers} />
      </div>
    </>
  );
}
