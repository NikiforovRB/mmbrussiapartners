"use client";

import * as React from "react";
import { Save, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_VAT_OPTIONS,
  type PaymentMethodType,
  type PaymentSettings,
  type PaymentVatType,
} from "@/lib/site-settings";

export function PaymentSettingsForm({ initial }: { initial: PaymentSettings }) {
  const { can } = usePermissions();
  const canEdit = can("settings.edit");
  const [serviceLabel, setServiceLabel] = React.useState(initial.serviceLabel);
  const [vatType, setVatType] = React.useState<PaymentVatType>(initial.vatType);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodType>(initial.paymentMethod);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (!serviceLabel.trim()) {
      toast.error("Укажите наименование услуги в чеке");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/payment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceLabel: serviceLabel.trim(), vatType, paymentMethod }),
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
