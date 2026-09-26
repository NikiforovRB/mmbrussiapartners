import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { db } from "@/lib/db";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { fioFromParts } from "@/lib/utils";
import { ProfileForm } from "@/app/(dealer)/dealer/profile/profile-form";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const session = await requireAdminPage();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user || !user.dealerProfile) redirect("/admin");

  const fio = fioFromParts({
    firstName: user.dealerProfile.firstName,
    lastName: user.dealerProfile.lastName,
    middleName: user.dealerProfile.middleName,
  });
  const avatarUrl = await getUserAvatarUrl(user.id);

  return (
    <>
      <Topbar
        title="Профиль"
        subtitle="Ваши контактные данные и фото"
        profileHref="/admin/profile"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <ProfileForm
          avatarUrl={avatarUrl}
          displayName={fio || user.email}
          initial={{
            firstName: user.dealerProfile.firstName,
            lastName: user.dealerProfile.lastName,
            middleName: user.dealerProfile.middleName ?? "",
            phone: user.dealerProfile.phone,
            organization: user.dealerProfile.organization ?? "",
            inn: user.dealerProfile.inn ?? "",
            city: user.dealerProfile.city ?? "",
            region: user.dealerProfile.region ?? "",
            country: user.dealerProfile.country ?? "",
            address: user.dealerProfile.address ?? "",
            siteComment: user.dealerProfile.siteComment ?? "",
            phoneVisibleOnSite: user.dealerProfile.phoneVisibleOnSite,
            notifyByEmail: user.notifyByEmail,
            notifyByTelegram: user.notifyByTelegram,
            telegramChatId: user.telegramChatId ?? "",
          }}
          publication={{
            status: user.dealerProfile.sitePublication,
            at: user.dealerProfile.sitePublicationAt?.toISOString() ?? null,
            note: user.dealerProfile.sitePublicationNote,
            consent: user.dealerProfile.phoneVisibleOnSite,
          }}
          email={user.email}
        />
      </div>
    </>
  );
}
