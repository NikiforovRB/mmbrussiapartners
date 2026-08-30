import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { Topbar } from "@/components/cabinet/topbar";
import { PricingManager, type PriceItem } from "./pricing-manager";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ dealer?: string }>;
}) {
  const { dealer: dealerParam } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/pricing");
  if (!hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin)) {
    redirect("/admin");
  }

  const [me, rows, dealers] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.priceListItem.findMany({ orderBy: [{ product: "asc" }, { bundle: "asc" }, { region: "asc" }] }),
    db.user.findMany({
      where: { dealerProfile: { isNot: null } },
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        dealerProfile: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            organization: true,
            priceAdjustKind: true,
            priceAdjustValue: true,
          },
        },
        prices: { select: { itemId: true, price: true } },
      },
    }),
  ]);

  const items: PriceItem[] = rows.map((r) => ({
    id: r.id,
    product: r.product,
    bundle: r.bundle,
    region: r.region,
    price: Number(r.price),
  }));

  return (
    <>
      <Topbar
        title="Справочник цен"
        subtitle="Цены лицензий по продуктам и комплектациям"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <PricingManager
          items={items}
          initialDealerId={dealerParam ?? null}
          dealers={dealers.map((d) => ({
            id: d.id,
            email: d.email,
            firstName: d.dealerProfile?.firstName ?? "",
            lastName: d.dealerProfile?.lastName ?? "",
            middleName: d.dealerProfile?.middleName ?? "",
            organization: d.dealerProfile?.organization ?? null,
            adjustKind: d.dealerProfile?.priceAdjustKind ?? "NONE",
            adjustValue:
              d.dealerProfile?.priceAdjustValue == null
                ? null
                : Number(d.dealerProfile.priceAdjustValue),
            overrides: d.prices.map((p) => ({ itemId: p.itemId, price: Number(p.price) })),
          }))}
        />
      </div>
    </>
  );
}
