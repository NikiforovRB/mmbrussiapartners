import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { mergeSupport } from "@/lib/site-settings";
import { Topbar } from "@/components/cabinet/topbar";
import { SupportOverview } from "@/components/support/support-channels";

export const dynamic = "force-dynamic";

export default async function DealerSupportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [user, settings] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: { dealerProfile: true, role: true },
    }),
    db.companySettings.findUnique({ where: { id: "singleton" }, select: { support: true } }),
  ]);
  if (!user) redirect("/login");

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Техподдержка"
        subtitle="Как связаться с MMB RUSSIA"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <SupportOverview
          support={mergeSupport(settings?.support)}
          empty={
            <>
              Каналы связи скоро появятся. Пока пишите на{" "}
              <a href="mailto:marat@mmbrussia.ru" className="text-accent hover:underline">
                marat@mmbrussia.ru
              </a>
              .
            </>
          }
        />
      </div>
    </>
  );
}
