import * as React from "react";
import { CreditCard, ReceiptText, ShieldCheck, Info, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import type { PaymentSettingsSummary } from "@/lib/payments/summary";
import { formatRub } from "@/lib/money";

const PROVIDER_TITLES: Record<string, string> = {
  manual: "Счёт на оплату (перевод / СБП по реквизитам)",
  atol_pay: "АТОЛ Pay (платёжные ссылки)",
};

const SNO_TITLES: Record<string, string> = {
  osn: "ОСН",
  usn_income: "УСН доход",
  usn_income_outcome: "УСН доход-расход",
  envd: "ЕНВД",
  esn: "ЕСХН",
  patent: "Патент",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-hairline last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm text-right break-all">{value}</span>
    </div>
  );
}

export function PaymentSettingsPanel({ summary }: { summary: PaymentSettingsSummary }) {
  const { acquiring, fiscalization, receiptEmail, pricing } = summary;
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Приём оплаты (эквайринг)</div>
        </div>
        <Row
          label="Настроенный провайдер"
          value={PROVIDER_TITLES[acquiring.configuredProvider] ?? acquiring.configuredProvider}
        />
        <Row
          label="Активный провайдер"
          value={
            <span className="inline-flex items-center gap-2">
              {PROVIDER_TITLES[acquiring.activeProvider] ?? acquiring.activeProvider}
              {acquiring.activeProvider === "atol_pay" ? (
                <Tag tone="success">онлайн</Tag>
              ) : (
                <Tag tone="neutral">ручное подтверждение</Tag>
              )}
            </span>
          }
        />
        <Row
          label="АТОЛ Pay токен"
          value={acquiring.atolPayConfigured ? <Tag tone="success">задан</Tag> : <Tag tone="warning">не задан</Tag>}
        />
        <Row
          label="Способы оплаты"
          value={
            acquiring.paymentMethods.length > 0
              ? acquiring.paymentMethods.join(", ")
              : "из настроек ЛК АТОЛ Pay"
          }
        />
        <Row
          label="Колбэк об оплате"
          value={acquiring.webhookConfigured ? <Tag tone="success">включён</Tag> : <Tag tone="warning">выключен</Tag>}
        />
        {acquiring.configuredProvider === "atol_pay" && !acquiring.atolPayConfigured ? (
          <p className="mt-3 text-xs text-warning">
            Провайдер выбран как АТОЛ Pay, но токен не задан — оплата работает в режиме счёта.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <ReceiptText className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Фискализация (54-ФЗ, АТОЛ Онлайн)</div>
        </div>
        <Row
          label="Статус"
          value={
            fiscalization.configured ? (
              <Tag tone="success">настроена</Tag>
            ) : (
              <Tag tone="danger">не настроена</Tag>
            )
          }
        />
        <Row label="Протокол" value={fiscalization.protocol} />
        <Row label="Наименование услуги в чеке" value={fiscalization.serviceLabel} />
        <Row label="Способ расчёта" value={fiscalization.paymentMethod} />
        <Row label="ИНН компании" value={fiscalization.company.inn || "—"} />
        <Row label="Email компании (ОФД)" value={fiscalization.company.email || "—"} />
        <Row
          label="Система налогообложения"
          value={SNO_TITLES[fiscalization.company.sno] ?? fiscalization.company.sno}
        />
        <Row label="Ставка НДС" value={fiscalization.company.vatType} />
        <Row label="Предмет расчёта" value={fiscalization.company.paymentObject} />
        <Row label="Адрес расчётов" value={fiscalization.company.paymentAddress || "—"} />
        <Row
          label="Секрет вебхука (авто-чек)"
          value={fiscalization.webhookConfigured ? <Tag tone="success">задан</Tag> : <Tag tone="warning">не задан</Tag>}
        />
        {fiscalization.missingEnv.length > 0 ? (
          <p className="mt-3 text-xs text-warning">
            Не заданы обязательные параметры: {fiscalization.missingEnv.join(", ")}.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Отправка чека дилеру (почта)</div>
        </div>
        <Row
          label="SMTP настроен"
          value={
            receiptEmail.smtpConfigured ? (
              <Tag tone="success">да</Tag>
            ) : (
              <Tag tone="warning">нет</Tag>
            )
          }
        />
        <Row label="Отправитель (From)" value={receiptEmail.from} />
        <p className="mt-3 text-xs text-ink-subtle">
          Чек об оплате уходит на Email, указанный при выставлении счёта (обязательное поле в мастере
          генерации), и дублируется оператором фискальных данных на тот же адрес. Параметры SMTP
          задаются в файле окружения на сервере.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <div className="font-display text-lg tracking-tight">Цены по умолчанию</div>
        </div>
        <Row
          label="Базовая цена генерации"
          value={
            pricing.defaultLicensePrice > 0
              ? formatRub(pricing.defaultLicensePrice)
              : "не задана"
          }
        />
        {Object.keys(pricing.bundlePrices).length > 0 ? (
          Object.entries(pricing.bundlePrices).map(([bundle, price]) => (
            <Row key={bundle} label={`Цена комплектации ${bundle}`} value={formatRub(price)} />
          ))
        ) : (
          <Row label="Прайс по комплектациям" value="используется по умолчанию" />
        )}
        <p className="mt-3 text-xs text-ink-subtle">
          Индивидуальные цены представителей задаются в разделе «Цены».
        </p>
      </Card>

      <Card tone="dark" className="relative overflow-hidden">
        <div
          className="absolute -top-32 -right-20 h-72 w-72 rounded-full blob"
          style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.6), transparent)" }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80">
            <Info className="h-4 w-4" />
            <div className="text-xs uppercase tracking-widest">Безопасность</div>
          </div>
          <p className="mt-3 text-sm text-white/70">
            Логины, пароли, токены и ключи вебхука хранятся в защищённом файле окружения на
            сервере и не редактируются из браузера. Здесь показано только то, что и как
            настроено. Изменение секретов выполняет администратор сервера в файле .env.
          </p>
        </div>
      </Card>
    </div>
  );
}
