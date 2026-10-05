import Link from "next/link";
import { Settings } from "lucide-react";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { mergeSupport } from "@/lib/site-settings";
import { SupportOverview } from "@/components/support/support-channels";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const session = await requireAdminPage();

  const [me, settings] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.companySettings.findUnique({ where: { id: "singleton" }, select: { support: true } }),
  ]);
  const support = mergeSupport(settings?.support);
  const canEdit = hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin);

  return (
    <>
      <Topbar
        title="Техподдержка"
        subtitle="Каналы связи и ссылки для представителей"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
        rightSlot={
          canEdit ? (
            <Link href="/admin/settings">
              <Button size="sm" variant="ghost" icon={<Settings className="h-4 w-4" />}>
                Настроить
              </Button>
            </Link>
          ) : undefined
        }
      />
      <div className="mt-6">
        <SupportOverview
          support={support}
          empty={
            <>
              Каналы связи ещё не настроены.
              {canEdit ? (
                <>
                  {" "}
                  <Link href="/admin/settings" className="text-accent hover:underline">
                    Добавить в настройках
                  </Link>
                  .
                </>
              ) : null}
            </>
          }
        />
      </div>
    </>
  );
}
