import Link from "next/link";
import { notFound } from "next/navigation";
import { Tags } from "lucide-react";
import { db } from "@/lib/db";
import { hasAdminScope, hasPermission } from "@/lib/permissions";
import { getDownloadUrl } from "@/lib/s3";
import { Topbar } from "@/components/cabinet/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { formatRuDateTime } from "@/lib/dates";
import { cn, fioFromParts, plural } from "@/lib/utils";
import { isSiteSyncConfigured } from "@/lib/site-dealers";
import { isPasswordVaultConfigured } from "@/lib/password-vault";
import { DealerEditor } from "./dealer-editor";
import { DealerPasswordCard } from "./dealer-password-card";
import { SitePublicationCard } from "./site-publication-card";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminDealerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAdminPage("dealers.view");
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "ips" ? "ips" : "profile";
  const [dealer, ipCount, legacy] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: { dealerProfile: true, role: true },
    }),
    db.userIp.count({ where: { userId: id } }),
    db.legacyDealer.findUnique({ where: { userId: id } }),
  ]);
  if (!dealer) notFound();

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const fio = fioFromParts({
    firstName: dealer.dealerProfile?.firstName,
    lastName: dealer.dealerProfile?.lastName,
    middleName: dealer.dealerProfile?.middleName,
  });

  const canManagePricing =
    Boolean(dealer.dealerProfile) &&
    hasPermission(session.user.permissions, "pricing.manage", session.user.isSuperAdmin);

  const isStaffAccount = dealer.isSuperAdmin || hasAdminScope(dealer.role.permissions);
  const deletable =
    hasPermission(session.user.permissions, "dealers.delete", session.user.isSuperAdmin) &&
    dealer.id !== session.user.id &&
    !isStaffAccount;
  const canManagePassword =
    !isStaffAccount &&
    hasPermission(session.user.permissions, "dealers.passwords", session.user.isSuperAdmin);

  const avatarUrl = dealer.dealerProfile?.avatarKey
    ? await getDownloadUrl(dealer.dealerProfile.avatarKey, 3600)
    : null;
  const p = dealer.dealerProfile;

  return (
    <>
      <Topbar
        title={fio || dealer.email}
        subtitle={`Профиль представителя · ${dealer.role.name}`}
        user={{
          name: me?.email ?? "Admin",
          email: me?.email ?? "",
          role: me?.role.name ?? "Admin",
        }}
        rightSlot={
          canManagePricing ? (
            <Link href={`/admin/pricing?dealer=${dealer.id}`}>
              <Button size="sm" variant="ghost" icon={<Tags className="h-4 w-4" />}>
                Цены представителя
              </Button>
            </Link>
          ) : undefined
        }
      />
      <nav className="mt-6 flex gap-1 border-b border-hairline">
        {[
          { id: "profile", label: "Профиль", href: `/admin/dealers/${dealer.id}` },
          { id: "ips", label: `IP-адреса · ${ipCount}`, href: `/admin/dealers/${dealer.id}?tab=ips` },
        ].map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
              tab === t.id ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "ips" ? (
        <div className="mt-6">
          <DealerIps userId={dealer.id} signupIp={dealer.dealerProfile?.signupIp ?? null} />
        </div>
      ) : (
      <div className="mt-6">
        <DealerEditor
          legacy={
            legacy
              ? {
                  id: legacy.id,
                  name: legacy.name,
                  city: legacy.city,
                  source: legacy.source,
                  licenses: legacy.licenses,
                  amountTotal: Number(legacy.amountTotal),
                  firstLicenseAt: legacy.firstLicenseAt?.toISOString() ?? null,
                  lastLicenseAt: legacy.lastLicenseAt?.toISOString() ?? null,
                }
              : null
          }
          dealer={{
            id: dealer.id,
            email: dealer.email,
            status: dealer.status,
            createdAt: dealer.createdAt.toISOString(),
            dealerProfile: dealer.dealerProfile
              ? {
                  firstName: dealer.dealerProfile.firstName,
                  lastName: dealer.dealerProfile.lastName,
                  middleName: dealer.dealerProfile.middleName,
                  organization: dealer.dealerProfile.organization,
                  inn: dealer.dealerProfile.inn,
                  phone: dealer.dealerProfile.phone,
                  city: dealer.dealerProfile.city,
                  region: dealer.dealerProfile.region,
                  country: dealer.dealerProfile.country,
                  address: dealer.dealerProfile.address,
                  siteComment: dealer.dealerProfile.siteComment,
                  licenseLimit: dealer.dealerProfile.licenseLimit,
                  licensesUsed: dealer.dealerProfile.licensesUsed,
                  driveModsAccess: dealer.dealerProfile.driveModsAccess,
                  driveModsRequestedAt: dealer.dealerProfile.driveModsRequestedAt?.toISOString() ?? null,
                  legacyDealer: dealer.dealerProfile.legacyDealer,
                }
              : null,
            role: { name: dealer.role.name },
          }}
          avatarUrl={avatarUrl}
          deletable={deletable}
          passwordCard={
            canManagePassword ? (
              <DealerPasswordCard
                dealerId={dealer.id}
                known={Boolean(dealer.passwordEncrypted)}
                configured={isPasswordVaultConfigured()}
              />
            ) : null
          }
          sitePublication={
            p ? (
              <SitePublicationCard
                dealerId={dealer.id}
                accountStatus={dealer.status}
                integrationEnabled={isSiteSyncConfigured()}
                publication={{
                  status: p.sitePublication,
                  at: p.sitePublicationAt?.toISOString() ?? null,
                  note: p.sitePublicationNote,
                  consent: p.phoneVisibleOnSite,
                  syncedAt: p.siteSyncedAt?.toISOString() ?? null,
                  syncStatus: p.siteSyncStatus,
                  syncMessage: p.siteSyncMessage,
                }}
                preview={{ phone: p.phone, city: p.city, country: p.country, siteComment: p.siteComment }}
              />
            ) : null
          }
        />
      </div>
      )}
    </>
  );
}

function flag(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

async function DealerIps({ userId, signupIp }: { userId: string; signupIp: string | null }) {
  const ips = await db.userIp.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" }, take: 200 });
  // Тот же адрес у других учёток — повод присмотреться (одна точка или передача доступа).
  const shared = ips.length
    ? await db.userIp.findMany({
        where: { ip: { in: ips.map((i) => i.ip) }, userId: { not: userId } },
        select: { ip: true, user: { select: { id: true, email: true } } },
        take: 200,
      })
    : [];
  const sharedByIp = new Map<string, { id: string; email: string }[]>();
  for (const s of shared) sharedByIp.set(s.ip, [...(sharedByIp.get(s.ip) ?? []), s.user]);
  const countries = [...new Set(ips.map((i) => i.country).filter(Boolean))];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-4">
        <div className="font-display text-lg tracking-tight">IP-адреса входа</div>
        <div className="text-xs text-ink-muted">
          {ips.length === 0
            ? "Адресов пока нет"
            : `${ips.length} ${plural(ips.length, ["адрес", "адреса", "адресов"])}${countries.length ? ` · ${countries.join(", ")}` : ""}`}
        </div>
      </div>
      {ips.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-ink-muted">
          Адреса записываются при входе и работе в кабинете — появятся после следующего визита представителя.
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {ips.map((i) => {
            const others = sharedByIp.get(i.ip) ?? [];
            return (
              <li key={i.id} className="grid gap-1 px-5 py-3 text-sm md:grid-cols-[180px_1fr_auto] md:items-center md:gap-4">
                <div className="font-mono text-[13px]">
                  {i.ip}
                  {i.ip === signupIp ? (
                    <Tag tone="muted" className="ml-2 px-2 py-0.5 text-[11px]">
                      регистрация
                    </Tag>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div>
                    {flag(i.countryCode)} {[i.country, i.city].filter(Boolean).join(", ") || "Страна не определена"}
                  </div>
                  {others.length > 0 ? (
                    <div className="mt-0.5 text-xs text-[#a16207]">
                      Этот адрес есть и у:{" "}
                      {others.map((o, idx) => (
                        <span key={o.id}>
                          {idx > 0 ? ", " : ""}
                          <Link href={`/admin/dealers/${o.id}?tab=ips`} className="underline hover:text-accent">
                            {o.email}
                          </Link>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-ink-muted md:text-right">
                  <div>Последний: {formatRuDateTime(i.lastSeenAt)}</div>
                  <div>
                    Первый: {formatRuDateTime(i.firstSeenAt)} · {i.hits}{" "}
                    {plural(i.hits, ["визит", "визита", "визитов"])}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
