import { db } from "@/lib/db";
import { priceKey } from "@/lib/pricing";
import { Topbar } from "@/components/cabinet/topbar";
import { PricingManager, type PriceItem } from "./pricing-manager";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ dealer?: string }>;
}) {
  const { dealer: dealerParam } = await searchParams;
  const session = await requireAdminPage("pricing.manage");

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
            phone: true,
            organization: true,
            priceAdjustKind: true,
            priceAdjustValue: true,
            priceTier: true,
            prepaid: true,
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
    myPrice: r.myPrice == null ? null : Number(r.myPrice),
    clientPrice: r.clientPrice == null ? null : Number(r.clientPrice),
  }));

  // Тройки, по которым лицензии уже выдавались, но цены в справочнике нет:
  // такие позиции ушли по запасной цене, и их видно сразу.
  //
  // Старые записи держали всё название в одном поле («MB-S5WM FULL RUS»);
  // такой продукт не совпадёт ни с одной позицией DRIVEMODS, и в списке он
  // только мешал бы — отличаем их по пробелу в коде продукта.
  const issued = await db.license.groupBy({
    by: ["product", "bundle", "productRegion"],
    where: { deletedAt: null, product: { not: null } },
  });
  const known = new Set(items.map((i) => priceKey(i)));
  const missing = issued
    .map((g) => ({
      product: (g.product ?? "").trim(),
      bundle: g.bundle ?? "",
      region: g.productRegion ?? "",
    }))
    .filter((p) => p.product && !p.product.includes(" ") && !known.has(priceKey(p)));

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
          missing={missing}
          initialDealerId={dealerParam ?? null}
          dealers={dealers.map((d) => ({
            id: d.id,
            email: d.email,
            firstName: d.dealerProfile?.firstName ?? "",
            lastName: d.dealerProfile?.lastName ?? "",
            middleName: d.dealerProfile?.middleName ?? "",
            phone: d.dealerProfile?.phone ?? null,
            organization: d.dealerProfile?.organization ?? null,
            adjustKind: d.dealerProfile?.priceAdjustKind ?? "NONE",
            adjustValue:
              d.dealerProfile?.priceAdjustValue == null
                ? null
                : Number(d.dealerProfile.priceAdjustValue),
            priceTier: (d.dealerProfile?.priceTier === "CLIENT" ? "CLIENT" : "DEALER") as
              | "DEALER"
              | "CLIENT",
            prepaid: d.dealerProfile?.prepaid ?? false,
            overrides: d.prices.map((p) => ({ itemId: p.itemId, price: Number(p.price) })),
          }))}
        />
      </div>
    </>
  );
}
