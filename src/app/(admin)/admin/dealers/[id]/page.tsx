import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Tags } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
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

  const canManagePricing =
    Boolean(dealer.dealerProfile) &&
    hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin);

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
        rightSlot={
          canManagePricing ? (
            <Link href={`/admin/pricing?dealer=${dealer.id}`}>
              <Button size="sm" variant="ghost" icon={<Tags className="h-4 w-4" />}>
                Цены представителя
              </Button>
            </Link>
          ) : undefined
        }
      />
      <div className="mt-6">
        <DealerEditor dealer={JSON.parse(JSON.stringify(dealer))} />
      </div>
    </>
  );
}
