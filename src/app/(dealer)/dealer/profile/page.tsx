import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserAvatarUrl } from "@/lib/user-avatar";
import { fioFromParts } from "@/lib/utils";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user || !user.dealerProfile) redirect("/dealer");

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
        subtitle="Ваши контактные данные и публикация телефона"
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
            address: user.dealerProfile.address ?? "",
            phoneVisibleOnSite: user.dealerProfile.phoneVisibleOnSite,
            notifyByEmail: user.notifyByEmail,
            notifyByTelegram: user.notifyByTelegram,
            telegramChatId: user.telegramChatId ?? "",
          }}
          email={user.email}
        />
      </div>
    </>
  );
}
