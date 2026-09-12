import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { hasPermission } from "@/lib/permissions";
import { NoticesManager, type NoticeRow } from "./notices-manager";

export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
  const session = await auth();
  if (!session?.user) return null;
  if (!hasPermission(session.user.permissions, "settings.edit", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const [notices, totalUsers] = await Promise.all([
    db.loginNotice.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { acknowledgements: true } } },
    }),
    db.user.count(),
  ]);

  const rows: NoticeRow[] = notices.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    active: n.active,
    acks: n._count.acknowledgements,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <Topbar
        title="Уведомления входа"
        subtitle="Показываются при входе и требуют подтверждения «Ознакомился»"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <NoticesManager notices={rows} totalUsers={totalUsers} />
      </div>
    </>
  );
}
