import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { LicenseDetailEditor } from "@/components/licenses/license-detail-editor";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLicensePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage("licenses.view");
  const { id } = await params;
  const license = await db.license.findUnique({
    where: { id },
    include: {
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { email: true } } },
      },
      dealer: { select: { email: true } },
      cancellationRequests: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!license) notFound();
  const latestRequest = license.cancellationRequests[0] ?? null;

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
        <LicenseDetailEditor
          license={JSON.parse(JSON.stringify(license))}
          context="admin"
          latestRequest={latestRequest ? JSON.parse(JSON.stringify(latestRequest)) : null}
        />
      </div>
    </>
  );
}
