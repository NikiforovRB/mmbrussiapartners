import { Topbar } from "@/components/cabinet/topbar";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { LicenseStepper } from "./license-stepper";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewLicensePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user || !user.dealerProfile) redirect("/dealer");

  const limit = user.dealerProfile.licenseLimit;
  const used = user.dealerProfile.licensesUsed;
  const remaining = Math.max(0, limit - used);
  const fio = fioFromParts({
    firstName: user.dealerProfile.firstName,
    lastName: user.dealerProfile.lastName,
    middleName: user.dealerProfile.middleName,
  });

  return (
    <>
      <Topbar
        title="Новая лицензия"
        subtitle={`Доступно ${remaining} из ${limit}`}
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <LicenseStepper limit={limit} used={used} dealerName={fio || user.email} />
      </div>
    </>
  );
}
