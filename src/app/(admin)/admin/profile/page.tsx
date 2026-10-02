import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { db } from "@/lib/db";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { fioFromParts } from "@/lib/utils";
import { ProfileForm } from "@/app/(dealer)/dealer/profile/profile-form";
import { requireAdminPage } from "@/lib/session";
import { NotificationPrefsCard } from "@/components/cabinet/notification-prefs-card";
import { notificationPrefsProps } from "@/lib/notification-prefs";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const session = await requireAdminPage();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) redirect("/admin");
  if (!user.dealerProfile) {
    return (
      <>
        <Topbar
          title="Профиль"
          subtitle="Уведомления на почту и в Telegram"
          profileHref="/admin/profile"
          user={{ name: user.email, email: user.email, role: user.role.name }}
        />
        <div className="mt-6 max-w-xl">
          <NotificationPrefsCard {...notificationPrefsProps(user)} />
        </div>
      </>
    );
  }

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
          }}
          notifications={<NotificationPrefsCard {...notificationPrefsProps(user)} />}
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
