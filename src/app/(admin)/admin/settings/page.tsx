import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mergeHomepageContent } from "@/lib/homepage-content";
import { Topbar } from "@/components/cabinet/topbar";
import { SettingsTabs } from "./settings-tabs";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [me, settings] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.companySettings.findUnique({ where: { id: "singleton" } }),
  ]);

  return (
    <>
      <Topbar
        title="Настройки"
        subtitle="Контакты компании и контент главной страницы"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <SettingsTabs
          general={{
            phone: settings?.phone ?? "8 (925) 037-46-66",
            email: settings?.email ?? "marat@mmbrussia.ru",
            address: settings?.address ?? "",
          }}
          homepage={mergeHomepageContent(settings?.homepage)}
        />
      </div>
    </>
  );
}
