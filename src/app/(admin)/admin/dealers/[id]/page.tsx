import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Tags } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { getDownloadUrl } from "@/lib/s3";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { fioFromParts } from "@/lib/utils";
import { isSiteSyncConfigured } from "@/lib/site-dealers";
import { DealerEditor } from "./dealer-editor";
import { SitePublicationCard } from "./site-publication-card";

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

  const deletable =
    hasPermission(session.user.permissions, "dealers.delete", session.user.isSuperAdmin) &&
    dealer.id !== session.user.id &&
    !dealer.isSuperAdmin &&
    !hasAdminScope(dealer.role.permissions);

  const avatarUrl = dealer.dealerProfile?.avatarKey
    ? await getDownloadUrl(dealer.dealerProfile.avatarKey, 3600)
    : null;
  const p = dealer.dealerProfile;

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
        <DealerEditor
          dealer={{
            id: dealer.id,
            email: dealer.email,
            status: dealer.status,
            createdAt: dealer.createdAt.toISOString(),
            dealerProfile: dealer.dealerProfile
              ? {
                  firstName: dealer.dealerProfile.firstName,
                  lastName: dealer.dealerProfile.lastName,
                  middleName: dealer.dealerProfile.middleName,
                  organization: dealer.dealerProfile.organization,
                  inn: dealer.dealerProfile.inn,
                  phone: dealer.dealerProfile.phone,
                  city: dealer.dealerProfile.city,
                  region: dealer.dealerProfile.region,
                  country: dealer.dealerProfile.country,
                  address: dealer.dealerProfile.address,
                  siteComment: dealer.dealerProfile.siteComment,
                  licenseLimit: dealer.dealerProfile.licenseLimit,
                  licensesUsed: dealer.dealerProfile.licensesUsed,
                  driveModsAccess: dealer.dealerProfile.driveModsAccess,
                  driveModsRequestedAt: dealer.dealerProfile.driveModsRequestedAt?.toISOString() ?? null,
                }
              : null,
            role: { name: dealer.role.name },
          }}
          avatarUrl={avatarUrl}
          deletable={deletable}
          sitePublication={
            p ? (
              <SitePublicationCard
                dealerId={dealer.id}
                accountStatus={dealer.status}
                integrationEnabled={isSiteSyncConfigured()}
                publication={{
                  status: p.sitePublication,
                  at: p.sitePublicationAt?.toISOString() ?? null,
                  note: p.sitePublicationNote,
                  consent: p.phoneVisibleOnSite,
                  syncedAt: p.siteSyncedAt?.toISOString() ?? null,
                  syncStatus: p.siteSyncStatus,
                  syncMessage: p.siteSyncMessage,
                }}
                preview={{ phone: p.phone, city: p.city, country: p.country, siteComment: p.siteComment }}
              />
            ) : null
          }
        />
      </div>
    </>
  );
}
