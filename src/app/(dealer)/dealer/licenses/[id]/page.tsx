import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { Topbar } from "@/components/cabinet/topbar";
import { LicenseDetailEditor } from "@/components/licenses/license-detail-editor";

export const dynamic = "force-dynamic";

export default async function LicenseDetailDealerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const license = await db.license.findUnique({
    where: { id },
    include: {
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: true } },
      cancellationRequests: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!license) notFound();
  if (license.dealerId !== session.user.id && !session.user.isSuperAdmin) {
    redirect("/dealer/licenses");
  }
  const latestRequest = license.cancellationRequests[0] ?? null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });

  const fio = fioFromParts({
    firstName: user?.dealerProfile?.firstName,
    lastName: user?.dealerProfile?.lastName,
    middleName: user?.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title={`Лицензия ${license.number}`}
        subtitle="Скачивание и аннулирование"
        user={{
          name: fio || user?.email || session.user.email || "",
          email: user?.email ?? session.user.email ?? "",
          role: user?.role.name ?? "Представитель",
        }}
      />
      <div className="mt-6">
        <LicenseDetailEditor
          // ID ШГУ вообще не уезжает в браузер представителя: его видят только
          // администраторы.
          license={JSON.parse(JSON.stringify({ ...license, deviceId: null }))}
          context="dealer"
          latestRequest={latestRequest ? JSON.parse(JSON.stringify(latestRequest)) : null}
        />
      </div>
    </>
  );
}
