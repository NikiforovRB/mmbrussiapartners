import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { fioFromParts } from "@/lib/utils";
import { DealerEditor } from "./dealer-editor";

export const dynamic = "force-dynamic";

export default async function AdminDealerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const dealer = await db.user.findUnique({
    where: { id },
    include: { dealerProfile: true, role: true },
  });
  if (!dealer) notFound();

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const fio = fioFromParts({
    firstName: dealer.dealerProfile?.firstName,
    lastName: dealer.dealerProfile?.lastName,
    middleName: dealer.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title={fio || dealer.email}
        subtitle={`Профиль представителя · ${dealer.role.name}`}
        user={{
          name: me?.email ?? "Admin",
          email: me?.email ?? "",
          role: me?.role.name ?? "Admin",
        }}
      />
      <div className="mt-6">
        <DealerEditor dealer={JSON.parse(JSON.stringify(dealer))} />
      </div>
    </>
  );
}
