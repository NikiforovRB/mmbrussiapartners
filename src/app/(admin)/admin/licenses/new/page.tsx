import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { LicenseStepper } from "@/app/(dealer)/dealer/licenses/new/license-stepper";

export const dynamic = "force-dynamic";

export default async function AdminNewLicensePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const canCreate =
    session.user.isSuperAdmin ||
    hasPermission(session.user.permissions, "licenses.create", session.user.isSuperAdmin);
  if (!canCreate) redirect("/admin/licenses");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/login");

  const limit = user.dealerProfile?.licenseLimit ?? 0;
  const used = user.dealerProfile?.licensesUsed ?? 0;

  return (
    <>
      <Topbar
        title="Новая лицензия"
        subtitle="Генерация лицензии администратором"
        user={{ name: user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <LicenseStepper limit={limit} used={used} context="admin" />
      </div>
    </>
  );
}
