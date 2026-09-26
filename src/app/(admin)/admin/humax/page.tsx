import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { db } from "@/lib/db";
import { HumaxPanel } from "@/components/humax/humax-panel";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminHumaxPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireAdminPage("licenses.view");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user) redirect("/login");

  const sp = await searchParams;
  const page = parsePage(sp.page);

  const [total, rows] = await Promise.all([
    db.humaxPassword.count(),
    db.humaxPassword.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { dealer: { select: { email: true } } },
    }),
  ]);

  return (
    <>
      <Topbar
        title="Пароли HUMAX"
        subtitle="Генерация паролей для ШГУ HUMAX"
        user={{ name: user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <HumaxPanel
          context="admin"
          records={rows.map((r) => ({
            id: r.id,
            serial: r.serial,
            password: r.password,
            comment: r.comment,
            createdAt: r.createdAt.toISOString(),
            dealerEmail: r.dealer?.email ?? null,
          }))}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/humax" />
      </div>
    </>
  );
}
