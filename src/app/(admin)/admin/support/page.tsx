import Link from "next/link";
import { LifeBuoy, Settings } from "lucide-react";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { mergeSupport } from "@/lib/site-settings";
import { SupportLinkCard } from "@/components/support/support-channels";
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
      <div className="mt-6 max-w-3xl">
        {support.intro?.trim() ? (
          <p className="text-sm text-ink-muted mb-5">{support.intro}</p>
        ) : null}

        <div className="flex items-center gap-2 mb-4">
          <LifeBuoy className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Мы на связи</div>
        </div>
        {support.channels.length === 0 ? (
          <div className="rounded-panel border border-hairline py-8 text-center text-sm text-ink-muted">
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
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {support.channels.map((c, i) => (
              <SupportLinkCard key={i} channel={c} />
            ))}
          </div>
        )}

        {support.requirements?.trim() ? (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-ink-muted mb-2">
              Требования и примечания
            </div>
            <p className="text-sm text-ink-muted whitespace-pre-line">{support.requirements}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
