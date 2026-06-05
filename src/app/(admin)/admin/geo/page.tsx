import { MapPinned, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";

export const dynamic = "force-dynamic";

export default async function AdminGeoPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [me, dealersByRegion, dealersByCity, licensesByRegion] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, include: { role: true } }),
    db.dealerProfile.groupBy({
      by: ["region"],
      _count: { _all: true },
      orderBy: { _count: { region: "desc" } },
      take: 12,
    }),
    db.dealerProfile.groupBy({
      by: ["city"],
      _count: { _all: true },
      orderBy: { _count: { city: "desc" } },
      take: 12,
    }),
    db.license.groupBy({
      by: ["region"],
      _count: { _all: true },
      orderBy: { _count: { region: "desc" } },
      take: 12,
      where: { deletedAt: null },
    }),
  ]);

  const totalDealers = dealersByRegion.reduce((s, r) => s + r._count._all, 0);
  const totalLicenses = licensesByRegion.reduce((s, r) => s + r._count._all, 0);

  return (
    <>
      <Topbar
        title="Гео-аналитика"
        subtitle="Распределение представителей и лицензий по регионам"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6 grid lg:grid-cols-3 gap-5">
        <Card tone="dark" className="relative overflow-hidden lg:col-span-3">
          <div className="absolute -top-32 -left-20 h-80 w-80 rounded-full blob"
            style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }} />
          <div className="relative grid sm:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 text-white/70 text-xs">
                <MapPinned className="h-4 w-4" /> Всего регионов
              </div>
              <div className="mt-2 font-display text-4xl  tracking-tightest">
                {dealersByRegion.length}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-white/70 text-xs">
                <TrendingUp className="h-4 w-4" /> Представителей
              </div>
              <div className="mt-2 font-display text-4xl  tracking-tightest">{totalDealers}</div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-white/70 text-xs">
                <TrendingUp className="h-4 w-4" /> Лицензий
              </div>
              <div className="mt-2 font-display text-4xl  tracking-tightest">{totalLicenses}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="font-display  tracking-tight mb-3">Топ регионов (дилеры)</div>
          <ul className="space-y-2">
            {dealersByRegion.map((r) => (
              <li key={r.region ?? "?"} className="flex items-center justify-between rounded-panel bg-white p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-panel bg-card-light text-accent">
                    <MapPinned className="h-4 w-4" />
                  </span>
                  <span className="">{r.region ?? "Не указано"}</span>
                </div>
                <Tag tone="accent">{r._count._all}</Tag>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="font-display  tracking-tight mb-3">Топ городов (дилеры)</div>
          <ul className="space-y-2">
            {dealersByCity.map((r) => (
              <li key={r.city ?? "?"} className="flex items-center justify-between rounded-panel bg-white p-3">
                <span className="">{r.city ?? "Не указано"}</span>
                <Tag tone="muted">{r._count._all}</Tag>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="font-display  tracking-tight mb-3">Топ регионов (лицензии)</div>
          <ul className="space-y-2">
            {licensesByRegion.map((r) => (
              <li key={r.region ?? "?"} className="flex items-center justify-between rounded-panel bg-white p-3">
                <span className="">{r.region ?? "Не указано"}</span>
                <Tag tone="success">{r._count._all}</Tag>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
