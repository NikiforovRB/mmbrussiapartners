import Link from "next/link";
import type { AuditEntity, LicenseAction, Prisma } from "@prisma/client";
import { History } from "lucide-react";
import { db } from "@/lib/db";
import { Topbar } from "@/components/cabinet/topbar";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { formatRuDate, formatRuDateTime, formatRuTime } from "@/lib/dates";
import { formatRub } from "@/lib/money";
import { Pagination, parsePage } from "@/components/cabinet/pagination";
import { cn } from "@/lib/utils";
import { requireAdminPage } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

/** Две ленты: по лицензиям и по всему остальному администрированию. */
const TABS = [
  { id: "licenses", label: "Лицензии" },
  { id: "admin", label: "Администрирование" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const LICENSE_FILTERS: { id: LicenseAction | ""; label: string }[] = [
  { id: "", label: "Все" },
  { id: "CREATED", label: "Создание" },
  { id: "EDITED", label: "Изменение" },
  { id: "CANCELLED", label: "Аннулирование" },
  { id: "DELETED", label: "Удаление" },
  { id: "RESTORED", label: "Восстановление" },
];

const ADMIN_FILTERS: { id: AuditEntity | ""; label: string }[] = [
  { id: "", label: "Все" },
  { id: "DEALER", label: "Дилеры" },
  { id: "PAYMENT", label: "Платежи" },
  { id: "PRICE", label: "Цены" },
  { id: "ROLE", label: "Пользователи и роли" },
  { id: "SETTINGS", label: "Настройки" },
];

/** С таким summary пишется правка цен дилера; по нему видно, что entityId — это дилер. */
const DEALER_PRICES_SUMMARY = "Цены дилера";

const TH = "px-3 py-2.5 font-normal first:pl-4 last:pr-4";
const TD = "px-3 py-3 align-top first:pl-4 last:pr-4";

function auditHref(tab: Tab, filter: string) {
  const qs = new URLSearchParams({ tab });
  if (filter) qs.set("f", filter);
  return `/admin/audit?${qs}`;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string; f?: string }>;
}) {
  const session = await requireAdminPage("auditLog.view");

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const tab: Tab = sp.tab === "admin" ? "admin" : "licenses";
  const filters = tab === "licenses" ? LICENSE_FILTERS : ADMIN_FILTERS;
  const filter = filters.find((f) => f.id !== "" && f.id === sp.f)?.id ?? "";
  const skip = (page - 1) * PAGE_SIZE;

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });

  const licenseWhere: Prisma.LicenseAuditLogWhereInput = filter ? { action: filter as LicenseAction } : {};
  const adminWhere: Prisma.AdminAuditLogWhereInput = filter ? { entity: filter as AuditEntity } : {};

  const [total, licenseLogs, adminLogs] =
    tab === "licenses"
      ? await Promise.all([
          db.licenseAuditLog.count({ where: licenseWhere }),
          db.licenseAuditLog.findMany({
            where: licenseWhere,
            include: {
              actor: { select: { email: true } },
              license: {
                select: {
                  id: true,
                  number: true,
                  product: true,
                  bundle: true,
                  dealerId: true,
                  dealer: { select: { email: true } },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
          }),
          Promise.resolve([]),
        ])
      : await Promise.all([
          db.adminAuditLog.count({ where: adminWhere }),
          Promise.resolve([]),
          db.adminAuditLog.findMany({
            where: adminWhere,
            include: { actor: { select: { email: true } } },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
          }),
        ]);

  const priceDealerIds = adminLogs
    .filter((l) => l.entity === "PRICE" && l.summary === DEALER_PRICES_SUMMARY)
    .map((l) => l.entityId);
  const priceDealers = priceDealerIds.length
    ? await db.user.findMany({ where: { id: { in: [...new Set(priceDealerIds)] } }, select: { id: true, email: true } })
    : [];
  const dealerEmail = new Map(priceDealers.map((u) => [u.id, u.email]));

  const isEmpty = tab === "licenses" ? licenseLogs.length === 0 : adminLogs.length === 0;

  return (
    <>
      <Topbar
        title="Логи"
        user={{ name: me?.email ?? "Admin", email: me?.email ?? "", role: me?.role.name ?? "Admin" }}
      />
      <div className="mt-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-accent" />
              <div className="font-display  tracking-tight">События</div>
            </div>
            <div className="flex items-center gap-1 rounded-panel bg-surface-muted p-1">
              {TABS.map((t) => (
                <Link
                  key={t.id}
                  href={auditHref(t.id, "")}
                  className={cn(
                    "rounded-btn px-3.5 py-1.5 text-sm transition-colors",
                    tab === t.id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <Link
                key={f.id || "all"}
                href={auditHref(tab, f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  filter === f.id
                    ? "border-accent bg-soft-accent text-strong-accent"
                    : "border-hairline text-ink-muted hover:border-accent hover:text-accent",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>

          {isEmpty ? (
            <div className="rounded-panel border border-hairline py-10 text-center text-sm text-ink-muted">
              {filter ? "Таких событий пока нет" : "Событий пока нет"}
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-clean rounded-panel border border-hairline">
              {tab === "licenses" ? (
                <table className="w-full min-w-[980px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[140px]" />
                    <col className="w-[150px]" />
                    <col className="w-[190px]" />
                    <col className="w-[230px]" />
                    <col className="w-[220px]" />
                    <col />
                  </colgroup>
                  <thead className="bg-surface-muted/60">
                    <tr className="text-left text-[11px] uppercase tracking-tight text-ink-subtle">
                      <th className={TH}>Когда</th>
                      <th className={TH}>Событие</th>
                      <th className={TH}>Лицензия</th>
                      <th className={TH}>Дилер</th>
                      <th className={TH}>Кто</th>
                      <th className={TH}>Комментарий</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline border-t border-hairline">
                    {licenseLogs.map((l) => {
                      const dealer = l.license.dealer.email;
                      const product = [l.license.product, l.license.bundle].filter(Boolean).join(" · ");
                      return (
                        <tr key={l.id} className="transition-colors hover:bg-surface-muted/50">
                          <td className={TD}>
                            <When at={l.createdAt} />
                          </td>
                          <td className={TD}>
                            <Tag tone={licenseTone(l.action)}>{licenseLabel(l.action)}</Tag>
                          </td>
                          <td className={TD}>
                            <Link
                              href={`/admin/licenses/${l.license.id}`}
                              className="whitespace-nowrap tabular-nums hover:text-accent"
                            >
                              {l.license.number}
                            </Link>
                            {product ? <div className="mt-0.5 truncate text-xs text-ink-subtle">{product}</div> : null}
                          </td>
                          <td className={TD}>
                            <Link
                              href={`/admin/dealers/${l.license.dealerId}`}
                              className="block truncate hover:text-accent"
                              title={dealer}
                            >
                              {dealer}
                            </Link>
                          </td>
                          <td className={TD}>
                            {l.actor.email === dealer ? (
                              <span className="text-ink-muted">сам дилер</span>
                            ) : (
                              <span className="block truncate text-ink-muted" title={l.actor.email}>
                                {l.actor.email}
                              </span>
                            )}
                          </td>
                          <td className={TD}>
                            {l.reason ? (
                              <div className="whitespace-pre-line break-words">{l.reason}</div>
                            ) : (
                              <span className="text-ink-subtle">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[1040px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[140px]" />
                    <col className="w-[150px]" />
                    <col className="w-[240px]" />
                    <col className="w-[260px]" />
                    <col className="w-[220px]" />
                    <col />
                  </colgroup>
                  <thead className="bg-surface-muted/60">
                    <tr className="text-left text-[11px] uppercase tracking-tight text-ink-subtle">
                      <th className={TH}>Когда</th>
                      <th className={TH}>Раздел</th>
                      <th className={TH}>Действие</th>
                      <th className={TH}>Объект</th>
                      <th className={TH}>Кто</th>
                      <th className={TH}>Изменения</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline border-t border-hairline">
                    {adminLogs.map((l) => (
                      <tr key={l.id} className="transition-colors hover:bg-surface-muted/50">
                        <td className={TD}>
                          <When at={l.createdAt} />
                        </td>
                        <td className={TD}>
                          <Tag tone={ENTITY_TONE[l.entity]}>{entityLabel(l.entity, l.action)}</Tag>
                        </td>
                        <td className={cn(TD, "break-words")}>{actionLabel(l.entity, l.action, l.summary)}</td>
                        <td className={cn(TD, "break-words")}>
                          <AuditObject log={l} dealerEmail={dealerEmail} />
                        </td>
                        <td className={TD}>
                          <span className="block truncate text-ink-muted" title={l.actor.email}>
                            {l.actor.email}
                          </span>
                        </td>
                        <td className={TD}>
                          <Changes diff={l.diff} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/audit"
            query={{ tab, f: filter || undefined }}
          />
        </Card>
      </div>
    </>
  );
}

function When({ at }: { at: Date }) {
  return (
    <div title={formatRuDateTime(at)}>
      <div className="whitespace-nowrap">{formatRuDate(at)}</div>
      <div className="mt-0.5 text-xs tabular-nums text-ink-subtle">{formatRuTime(at)}</div>
    </div>
  );
}

function AuditObject({
  log,
  dealerEmail,
}: {
  log: { entity: AuditEntity; entityId: string; action: string; summary: string | null };
  dealerEmail: Map<string, string>;
}) {
  if (log.entity === "DEALER" && log.action !== "DEALER_DELETED") {
    return (
      <Link href={`/admin/dealers/${log.entityId}`} className="hover:text-accent">
        {log.summary ?? log.entityId}
      </Link>
    );
  }
  if (log.entity === "PRICE" && log.summary === DEALER_PRICES_SUMMARY) {
    const email = dealerEmail.get(log.entityId);
    return (
      <Link href={`/admin/pricing?dealer=${log.entityId}`} className="hover:text-accent">
        {email ?? DEALER_PRICES_SUMMARY}
      </Link>
    );
  }
  return log.summary ? <span className="text-ink-muted">{log.summary}</span> : <span className="text-ink-subtle">—</span>;
}

// ─────────────────────────── изменения ───────────────────────────

/** Сколько изменений видно сразу; остальные — под «ещё N». */
const CHANGES_VISIBLE = 4;

/** Дублируют само событие (одобрение и его время) — в списке изменений только шум. */
const HIDDEN_FIELDS = new Set(["approvedAt", "approvedById"]);

const FIELD_LABEL: Record<string, string> = {
  status: "Статус",
  email: "Email",
  firstName: "Имя",
  lastName: "Фамилия",
  middleName: "Отчество",
  phone: "Телефон",
  organization: "Организация",
  inn: "ИНН",
  country: "Страна",
  region: "Регион",
  city: "Город",
  address: "Адрес",
  telegramNick: "Telegram",
  companyUrl: "Сайт компании",
  siteComment: "Подпись на сайте",
  siteCities: "Города на сайте",
  licenseLimit: "Лимит лицензий",
  rejectionReason: "Причина отказа",
  suspensionReason: "Причина блокировки",
  sitePublication: "Публикация на сайте",
  sitePublicationNote: "Комментарий к публикации",
  phoneVisibleOnSite: "Телефон на сайте",
  driveModsAccess: "Доступ к ЛК DriveMods",
  driveModsRejectReason: "Причина отказа",
  legacyDealer: "Работал в ЛК DriveMods",
  roleId: "Роль",
  isSuperAdmin: "Суперадмин",
  permissions: "Права",
  added: "Добавлены права",
  removed: "Сняты права",
  price: "Цена",
  цена: "Цена",
  позиция: "Позиция",
  правило: "Правило цен",
  величина: "Величина",
  личныхЦен: "Личных цен",
  records: "Записей",
  ids: "Записи",
};

const VALUE_LABEL: Record<string, Record<string, string>> = {
  status: { PENDING: "на рассмотрении", APPROVED: "одобрен", REJECTED: "отклонён", SUSPENDED: "заблокирован" },
  sitePublication: { NONE: "не опубликован", PENDING: "на модерации", APPROVED: "опубликован", REJECTED: "отклонён" },
  правило: { NONE: "как в справочнике", PERCENT: "процент", FIXED: "фиксированная сумма" },
};

const MONEY_FIELDS = new Set(["price", "цена"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatValue(field: string, value: Prisma.JsonValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return MONEY_FIELDS.has(field) ? formatRub(value) : value.toLocaleString("ru-RU");
  if (typeof value === "string") {
    if (VALUE_LABEL[field]?.[value]) return VALUE_LABEL[field][value];
    return ISO_DATE.test(value) ? formatRuDateTime(value) : value;
  }
  if (Array.isArray(value)) return value.length ? value.map((v) => formatValue(field, v)).join(", ") : "—";
  return JSON.stringify(value);
}

type Change = { field: string; label: string; from?: string; to: string };

function changesOf(diff: Prisma.JsonValue): Change[] {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return [];
  return Object.entries(diff)
    .filter(([field]) => !HIDDEN_FIELDS.has(field))
    .map(([field, v]) => {
      const label = FIELD_LABEL[field] ?? field;
      if (v && typeof v === "object" && !Array.isArray(v) && "from" in v && "to" in v) {
        return { field, label, from: formatValue(field, v.from), to: formatValue(field, v.to) };
      }
      return { field, label, to: formatValue(field, v) };
    });
}

function Changes({ diff }: { diff: Prisma.JsonValue }) {
  const changes = changesOf(diff);
  if (changes.length === 0) return <span className="text-ink-subtle">—</span>;
  const visible = changes.slice(0, CHANGES_VISIBLE);
  const rest = changes.slice(CHANGES_VISIBLE);
  return (
    <div className="space-y-1 text-xs leading-relaxed">
      {visible.map((c) => (
        <ChangeLine key={c.field} change={c} />
      ))}
      {rest.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-accent hover:underline group-open:hidden">
            ещё {rest.length}
          </summary>
          <div className="space-y-1">
            {rest.map((c) => (
              <ChangeLine key={c.field} change={c} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ChangeLine({ change }: { change: Change }) {
  return (
    <div className="break-words">
      <span className="text-ink-subtle">{change.label}:</span>{" "}
      {change.from !== undefined ? (
        <>
          <span className="text-ink-muted">{change.from}</span> <span className="text-ink-subtle">→</span>{" "}
        </>
      ) : null}
      <span className="text-ink">{change.to}</span>
    </div>
  );
}

// ─────────────────────────── подписи ───────────────────────────

const ENTITY_LABEL: Record<AuditEntity, string> = {
  DEALER: "Дилер",
  ROLE: "Роль",
  PAYMENT: "Платёж",
  SETTINGS: "Настройки",
  PRICE: "Цены",
};

const ENTITY_TONE: Record<AuditEntity, "accent" | "success" | "warning" | "neutral" | "muted"> = {
  DEALER: "accent",
  PAYMENT: "success",
  PRICE: "warning",
  ROLE: "neutral",
  SETTINGS: "muted",
};

function entityLabel(entity: AuditEntity, action: string) {
  return entity === "ROLE" && action.startsWith("USER_") ? "Пользователь" : ENTITY_LABEL[entity];
}

/** CREATED / UPDATED / DELETED пишут разные разделы — без раздела подпись неоднозначна. */
const ENTITY_ACTION_LABEL: Partial<Record<AuditEntity, Record<string, string>>> = {
  ROLE: { CREATED: "роль создана", UPDATED: "роль изменена", DELETED: "роль удалена" },
  PRICE: { CREATED: "позиция добавлена", UPDATED: "позиция изменена", DELETED: "позиция удалена" },
  SETTINGS: { UPDATED: "настройки изменены" },
  PAYMENT: { CANCELLED: "счёт отменён" },
};

const ACTION_LABEL: Record<string, string> = {
  CREATED: "создано",
  UPDATED: "обновлено",
  DELETED: "удалено",
  PROFILE_UPDATED: "профиль обновлён",
  ROLE_CHANGED: "роль изменена",
  STATUS_APPROVED: "одобрен",
  STATUS_REJECTED: "отклонён",
  STATUS_SUSPENDED: "заблокирован",
  STATUS_PENDING: "возвращён на рассмотрение",
  DRIVEMODS_ACCESS_GRANTED: "доступ к ЛК DriveMods подключён",
  DRIVEMODS_REQUEST_REJECTED: "заявка на доступ к ЛК DriveMods отклонена",
  SITE_PUBLICATION_APPROVED: "телефон опубликован на сайте",
  SITE_PUBLICATION_REJECTED: "публикация телефона отклонена",
  SITE_PUBLICATION_REVOKED: "телефон снят с сайта",
  SITE_CITIES_CHANGED: "города на сайте изменены",
  LEGACY_LINKED: "привязан к старому ЛК DriveMods",
  LEGACY_UNLINKED: "отвязан от старого ЛК DriveMods",
  LEGACY_RECORDS_ASSIGNED: "назначены записи старого ЛК DriveMods",
  LEGACY_RECORDS_REMOVED: "переданы записи старого ЛК DriveMods",
  LEGACY_RECORDS_RESET: "снято ручное назначение записей",
  LEGACY_MARKED_PAID: "записи ЛК DriveMods отмечены оплаченными",
  DEALER_DELETED: "удалён",
  PASSWORD_VIEWED: "просмотрен пароль",
  PASSWORD_CHANGED: "пароль изменён",
  USER_CREATED: "пользователь создан",
  USER_UPDATED: "пользователь изменён",
  USER_PROFILE_UPDATED: "профиль обновлён",
  USER_PASSWORD_RESET: "пароль сброшен",
  USER_ROLE_CHANGED: "роль изменена",
  USER_STATUS_CHANGED: "статус изменён",
  USER_SESSIONS_REVOKED: "сессии завершены",
  USER_SUPERADMIN_GRANTED: "выданы права суперадмина",
  USER_SUPERADMIN_REVOKED: "сняты права суперадмина",
  USER_EMAIL_CHANGED: "email изменён",
  KB_ARTICLE_CREATED: "статья базы знаний создана",
  KB_ARTICLE_UPDATED: "статья базы знаний изменена",
  KB_ARTICLE_DELETED: "статья базы знаний удалена",
  KB_CATEGORY_CREATED: "категория базы знаний создана",
  KB_CATEGORY_UPDATED: "категория базы знаний изменена",
  KB_CATEGORY_DELETED: "категория базы знаний удалена",
  LOGIN_NOTICE_CREATED: "уведомление входа создано",
  LOGIN_NOTICE_UPDATED: "уведомление входа изменено",
  LOGIN_NOTICE_DELETED: "уведомление входа удалено",
  CONFIRMED: "оплата подтверждена",
  CANCELLED: "отменён",
  FISCALIZED: "чек отправлен в кассу",
  REFUNDED: "возврат средств",
  REFUND_FISCALIZED: "чек возврата отправлен в кассу",
  PAYMENT_DELETED: "удалён",
};

/** Изменение пользователя пишет несколько действий через запятую. */
function actionLabel(entity: AuditEntity, action: string, summary: string | null) {
  if (entity === "PRICE" && action === "UPDATED" && summary === DEALER_PRICES_SUMMARY) return "Цены дилера изменены";
  const text = action
    .split(",")
    .map((a) => ENTITY_ACTION_LABEL[entity]?.[a] ?? ACTION_LABEL[a] ?? a)
    .join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function licenseLabel(a: string) {
  switch (a) {
    case "CREATED":
      return "Создана";
    case "EDITED":
      return "Изменена";
    case "CANCELLED":
      return "Аннулирована";
    case "REVOKED":
      return "Отозвана";
    case "DELETED":
      return "Удалена";
    case "RESTORED":
      return "Восстановлена";
    case "EXPIRED":
      return "Истекла";
    default:
      return a;
  }
}

function licenseTone(a: string): "neutral" | "accent" | "warning" | "danger" | "success" | "muted" {
  switch (a) {
    case "CREATED":
    case "RESTORED":
      return "success";
    case "EDITED":
      return "accent";
    case "CANCELLED":
      return "warning";
    case "REVOKED":
    case "DELETED":
      return "danger";
    case "EXPIRED":
      return "muted";
    default:
      return "neutral";
  }
}
