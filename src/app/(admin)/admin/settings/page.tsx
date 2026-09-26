import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mergeHomepageContent } from "@/lib/homepage-content";
import {
  mergeAnnouncement,
  mergeSupport,
  mergeGenerationSettings,
  mergePaymentSettings,
} from "@/lib/site-settings";
import { getPaymentSettingsSummary } from "@/lib/payments/summary";
import { Topbar } from "@/components/cabinet/topbar";
import { SettingsTabs } from "./settings-tabs";
import { PaymentSettingsPanel } from "./payment-settings-panel";
import { PaymentSettingsForm } from "./payment-settings-form";
import { getSiteSyncOverview } from "@/lib/site-dealers";
import { SiteSyncPanel } from "./site-sync-panel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [me, settings, siteSync] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.companySettings.findUnique({ where: { id: "singleton" } }),
    getSiteSyncOverview(),
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
          announcement={mergeAnnouncement(settings?.announcement)}
          support={mergeSupport(settings?.support)}
          generation={mergeGenerationSettings(settings?.generation)}
          payment={
            <div className="space-y-6">
              <PaymentSettingsForm initial={mergePaymentSettings(settings?.payment)} />
              <PaymentSettingsPanel
                summary={getPaymentSettingsSummary(mergePaymentSettings(settings?.payment))}
              />
            </div>
          }
          site={<SiteSyncPanel overview={siteSync} />}
        />
      </div>
    </>
  );
}
