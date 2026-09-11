import { Topbar } from "@/components/cabinet/topbar";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fioFromParts } from "@/lib/utils";
import { HumaxPanel } from "@/components/humax/humax-panel";
import { Pagination, parsePage } from "@/components/cabinet/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function DealerHumaxPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { dealerProfile: true, role: true },
  });
  if (!user) return null;

  const sp = await searchParams;
  const page = parsePage(sp.page);

  const [total, rows] = await Promise.all([
    db.humaxPassword.count({ where: { dealerId: user.id } }),
    db.humaxPassword.findMany({
      where: { dealerId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const fio = fioFromParts({
    firstName: user.dealerProfile?.firstName,
    lastName: user.dealerProfile?.lastName,
    middleName: user.dealerProfile?.middleName,
  });

  return (
    <>
      <Topbar
        title="Пароли HUMAX"
        subtitle="Генерация паролей для ШГУ HUMAX"
        user={{ name: fio || user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <HumaxPanel
          context="dealer"
          records={rows.map((r) => ({
            id: r.id,
            serial: r.serial,
            password: r.password,
            comment: r.comment,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/dealer/humax" />
      </div>
    </>
  );
}
