import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { Topbar } from "@/components/cabinet/topbar";
import { ReportsBuilder } from "@/components/reports/reports-builder";

export const dynamic = "force-dynamic";

export default async function DealerReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/login");

  const productRows = await db.license.findMany({
    where: { dealerId: user.id, deletedAt: null, product: { not: null } },
    distinct: ["product"],
    select: { product: true },
    orderBy: { product: "asc" },
  });
  const products = productRows.map((r) => r.product).filter((p): p is string => Boolean(p));

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Отчёты"
        subtitle="Экспорт ваших лицензий за период"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <ReportsBuilder context="dealer" products={products} />
      </div>
    </>
  );
}
