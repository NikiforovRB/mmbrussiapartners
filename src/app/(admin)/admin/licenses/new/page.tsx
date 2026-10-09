import { redirect } from "next/navigation";
import { Topbar } from "@/components/cabinet/topbar";
import { db } from "@/lib/db";
import { hasAdminScope } from "@/lib/permissions";
import { fioFromParts } from "@/lib/utils";
import {
  LicenseStepper,
  type DealerChoice,
} from "@/app/(dealer)/dealer/licenses/new/license-stepper";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Подпись лицензии по умолчанию: имя и город, как у дилера в его мастере. */
function defaultComment(firstName?: string | null, city?: string | null, fallback = "") {
  return [firstName, city].map((v) => v?.trim()).filter(Boolean).join(", ") || fallback;
}

export default async function AdminNewLicensePage() {
  const session = await requireAdminPage("licenses.create");

  const [user, dealerUsers] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      include: { dealerProfile: true, role: true },
    }),
    db.user.findMany({
      where: { status: "APPROVED", isSuperAdmin: false, dealerProfile: { isNot: null } },
      select: {
        id: true,
        email: true,
        role: { select: { permissions: true } },
        dealerProfile: {
          select: { firstName: true, lastName: true, middleName: true, organization: true, city: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!user) redirect("/login");

  const limit = user.dealerProfile?.licenseLimit ?? 0;
  const used = user.dealerProfile?.licensesUsed ?? 0;

  const dealers: DealerChoice[] = dealerUsers
    .filter((d) => d.id !== user.id && !hasAdminScope(d.role.permissions))
    .map((d) => {
      const p = d.dealerProfile;
      return {
        id: d.id,
        label: fioFromParts({ firstName: p?.firstName, lastName: p?.lastName, middleName: p?.middleName }) || d.email,
        hint: [p?.organization, p?.city, d.email].filter(Boolean).join(" · "),
        email: d.email,
        comment: defaultComment(p?.firstName, p?.city, d.email),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));

  return (
    <>
      <Topbar
        title="Новая лицензия"
        subtitle="Генерация лицензии администратором"
        user={{ name: user.email, email: user.email, role: user.role.name }}
      />
      <div className="mt-6">
        <LicenseStepper
          limit={limit}
          used={used}
          context="admin"
          dealerName={defaultComment(user.dealerProfile?.firstName, user.dealerProfile?.city, user.email)}
          defaultEmail={user.email}
          dealers={dealers}
        />
      </div>
    </>
  );
}
