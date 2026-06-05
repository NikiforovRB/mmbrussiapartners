import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { LicenseDetailEditor } from "@/components/licenses/license-detail-editor";

export const dynamic = "force-dynamic";

export default async function AdminLicensePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const license = await db.license.findUnique({
    where: { id },
    include: {
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: true } },
      dealer: true,
    },
  });
  if (!license) notFound();

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  return (
    <>
      <Topbar
        title={`Лицензия ${license.number}`}
        subtitle={`Дилер: ${license.dealer.email}`}
        user={{
          name: me?.email ?? "Admin",
          email: me?.email ?? "",
          role: me?.role.name ?? "Admin",
        }}
      />
      <div className="mt-6">
        <LicenseDetailEditor license={JSON.parse(JSON.stringify(license))} context="admin" />
      </div>
    </>
  );
}
