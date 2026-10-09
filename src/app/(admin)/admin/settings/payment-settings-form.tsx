"use client";

import * as React from "react";
import { Save, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_VAT_OPTIONS,
  type PaymentMethodType,
  type PaymentSettings,
  type PaymentVatType,
} from "@/lib/site-settings";

export function PaymentSettingsForm({
  initial,
  connectedTypes,
}: {
  initial: PaymentSettings;
  /** Способы оплаты, подключённые на сервере (ATOL_PAY_PAYMENT_METHODS). */
  connectedTypes: { value: string; label: string }[];
}) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [serviceLabel, setServiceLabel] = React.useState(initial.serviceLabel);
  const [vatType, setVatType] = React.useState<PaymentVatType>(initial.vatType);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodType>(initial.paymentMethod);
  const [checkoutTypes, setCheckoutTypes] = React.useState<string[]>(() => {
    const connected = connectedTypes.map((t) => t.value);
    const picked = initial.checkoutTypes.filter((t) => connected.includes(t));
    return picked.length > 0 ? picked : connected;
  });
  const [merchantName, setMerchantName] = React.useState(initial.merchantName);
  const [saving, setSaving] = React.useState(false);

  function toggleType(value: string, on: boolean) {
    setCheckoutTypes((prev) => (on ? [...new Set([...prev, value])] : prev.filter((t) => t !== value)));
  }

  async function save() {
    if (!serviceLabel.trim()) {
      toast.error("Укажите наименование услуги в чеке");
      return;
    }
    if (connectedTypes.length > 0 && checkoutTypes.length === 0) {
      toast.error("Оставьте хотя бы один способ оплаты");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/payment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceLabel: serviceLabel.trim(),
        vatType,
        paymentMethod,
        checkoutTypes,
        merchantName: merchantName.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Ошибка сохранения");
      return;
    }
    toast.success("Настройки оплаты сохранены");
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <ReceiptText className="h-5 w-5 text-accent" />
        <div className="font-display text-lg tracking-tight">Параметры чека</div>
      </div>
      <p className="text-sm text-ink-muted mb-4">
        Эти значения попадают в фискальный чек при каждой оплате. Секреты кассы и эквайринга
        (логины, токены) задаются в файле окружения на сервере.
      </p>
      <div className="grid gap-4">
        <Input
          label="Наименование услуги в чеке"
          value={serviceLabel}
          disabled={!canEdit}
          onChange={(e) => setServiceLabel(e.target.value)}
          hint="Тег 1030. Отображается в чеке как предмет расчёта."
          placeholder="Услуга по модификации программного обеспечения"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <Select
            label="Ставка НДС"
            value={vatType}
            disabled={!canEdit}
            onChange={(v) => setVatType(v as PaymentVatType)}
            options={PAYMENT_VAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <Select
            label="Способ расчёта"
            value={paymentMethod}
            disabled={!canEdit}
            onChange={(v) => setPaymentMethod(v as PaymentMethodType)}
            options={PAYMENT_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        <Input
          label="Название магазина на странице оплаты"
          value={merchantName}
          maxLength={64}
          disabled={!canEdit}
          onChange={(e) => setMerchantName(e.target.value)}
          hint="Показывается на форме АТОЛ Pay над реквизитами продавца. Название в приложении банка и в выписке задаёт эквайер (для СБП — ЮKassa), отсюда его не поменять."
          placeholder="MMB RUSSIA"
        />
        <div>
          <div className="text-sm">Способы оплаты на странице АТОЛ Pay</div>
          {connectedTypes.length > 0 ? (
            <>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                {connectedTypes.map((t) => (
                  <Checkbox
                    key={t.value}
                    checked={checkoutTypes.includes(t.value)}
                    disabled={!canEdit}
                    onChange={(on) => toggleType(t.value, on)}
                    label={t.label}
                  />
                ))}
              </div>
              <div className="mt-1.5 text-xs text-ink-muted">
                Можно оставить один способ, например только СБП. Новые ссылки на оплату будут с выбранными
                способами; уже выданные не меняются.
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-ink-muted">
              Способы оплаты берутся из настроек ЛК АТОЛ Pay: на сервере не задан список ATOL_PAY_PAYMENT_METHODS.
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          loading={saving}
          disabled={!canEdit}
          title={canEdit ? undefined : "Нет права на редактирование настроек"}
          icon={<Save className="h-4 w-4" />}
          onClick={save}
        >
          Сохранить
        </Button>
      </div>
    </Card>
  );
}
