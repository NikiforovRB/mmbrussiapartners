"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Tag as TagIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { Modal } from "@/components/ui/modal";

export type PriceItem = {
  id: string;
  product: string;
  bundle: string;
  region: string;
  price: number;
};

type AdjustKind = "NONE" | "PERCENT" | "FIXED";

export type PricingDealer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  organization: string | null;
  adjustKind: AdjustKind;
  adjustValue: number | null;
  overrides: { itemId: string; price: number }[];
};

const ADJUST_OPTIONS = [
  { value: "NONE", label: "Как в справочнике" },
  { value: "PERCENT", label: "Процент ко всем ценам" },
  { value: "FIXED", label: "Фиксированная сумма ко всем ценам" },
];

function rub(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

/** Тот же расчёт, что на сервере: показываем ровно ту сумму, что попадёт в счёт. */
function withAdjust(base: number, kind: AdjustKind, value: number | null) {
  if (kind === "PERCENT" && value !== null) {
    return Math.max(0, Math.round(base * (1 + value / 100) * 100) / 100);
  }
  if (kind === "FIXED" && value !== null) {
    return Math.max(0, Math.round((base + value) * 100) / 100);
  }
  return base;
}

function dealerName(d: PricingDealer) {
  const fio = [d.lastName, d.firstName, d.middleName].filter(Boolean).join(" ");
  return fio || d.organization || d.email;
}

export function PricingManager({
  items,
  dealers,
  initialDealerId,
}: {
  items: PriceItem[];
  dealers: PricingDealer[];
  /** Приходит из карточки представителя: открываем сразу его цены. */
  initialDealerId?: string | null;
}) {
  const [tab, setTab] = React.useState<"catalog" | "dealers">(
    initialDealerId ? "dealers" : "catalog",
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { key: "catalog" as const, label: "Справочник" },
          { key: "dealers" as const, label: "Цены представителей" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-btn px-4 h-9 inline-flex items-center text-sm transition-colors ${
              tab === t.key
                ? "bg-accent text-white"
                : "border border-hairline text-ink hover:border-accent hover:text-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "catalog" ? (
        <Catalog items={items} />
      ) : (
        <DealerPrices items={items} dealers={dealers} initialDealerId={initialDealerId} />
      )}
    </div>
  );
}

// ─────────────────────────── справочник ───────────────────────────

function Catalog({ items }: { items: PriceItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<PriceItem | "new" | null>(null);

  const byProduct = React.useMemo(() => {
    const map = new Map<string, PriceItem[]>();
    for (const item of items) {
      const list = map.get(item.product) ?? [];
      list.push(item);
      map.set(item.product, list);
    }
    return [...map.entries()];
  }, [items]);

  async function remove(item: PriceItem) {
    const name = [item.product, item.bundle, item.region].filter(Boolean).join(" ");
    if (!confirm(`Удалить позицию «${name}»? Личные цены представителей по ней тоже исчезнут.`)) {
      return;
    }
    const res = await fetch(`/api/pricing/items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось удалить");
      return;
    }
    toast.success("Позиция удалена");
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted max-w-2xl">
          DRIVEMODS отдаёт только продукт, комплектацию и регион — цены задаются здесь. Если у
          продукта нет комплектаций, оставьте поле пустым: такая цена применится ко всему продукту.
        </p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
          Добавить позицию
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-ink-muted">
            <TagIcon className="h-6 w-6 mx-auto text-ink-subtle" />
            <div className="mt-2 text-sm">
              Справочник пуст. Пока в нём нет позиции, счёт выставляется по запасной цене из
              настроек.
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {byProduct.map(([product, list]) => (
            <div key={product} className="rounded-panel border border-hairline overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-muted">
                <div className="font-display tracking-tight">{product}</div>
                <span className="text-xs text-ink-muted">
                  {list.length} {list.length === 1 ? "позиция" : "позиций"}
                </span>
              </div>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-tight text-ink-subtle">
                    <th className="px-4 py-2.5 font-normal">Комплектация</th>
                    <th className="px-4 py-2.5 font-normal">Регион</th>
                    <th className="px-4 py-2.5 font-normal">Цена</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline border-t border-hairline">
                  {list.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        {item.bundle ? (
                          <Tag tone="accent">{item.bundle}</Tag>
                        ) : (
                          <span className="text-ink-muted">Без комплектаций</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{item.region || "Все регионы"}</td>
                      <td className="px-4 py-3 font-display tracking-tight">{rub(item.price)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => setEditing(item)}
                          >
                            Изменить
                          </Button>
                          <Button
                            size="sm"
                            variant="ghostDanger"
                            icon={<Trash2 className="h-4 w-4" />}
                            onClick={() => remove(item)}
                          >
                            Удалить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <ItemModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </>
  );
}

function ItemModal({
  value,
  onClose,
  onSaved,
}: {
  value: PriceItem | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = value === "new";
  const item = isNew || value === null ? null : value;
  const [product, setProduct] = React.useState("");
  const [bundle, setBundle] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setProduct(item?.product ?? "");
    setBundle(item?.bundle ?? "");
    setRegion(item?.region ?? "");
    setPrice(item ? String(item.price) : "");
  }, [item]);

  async function save() {
    const amount = Number(price.replace(",", "."));
    if (!product.trim()) {
      toast.error("Укажите продукт");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Укажите цену");
      return;
    }
    setSaving(true);
    const res = await fetch(item ? `/api/pricing/items/${item.id}` : "/api/pricing/items", {
      method: item ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: product.trim(), bundle, region, price: amount }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return;
    }
    toast.success(item ? "Позиция обновлена" : "Позиция добавлена");
    onSaved();
  }

  return (
    <Modal
      open={value !== null}
      onClose={onClose}
      title={item ? "Изменить позицию" : "Новая позиция"}
      size="md"
    >
      <div className="space-y-3">
        <Input
          label="Продукт *"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="MB-S5WM"
          hint="Ровно так, как продукт называется в DRIVEMODS"
        />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Комплектация"
            value={bundle}
            onChange={(e) => setBundle(e.target.value)}
            placeholder="FULL"
            hint="Пусто — у продукта одна цена"
          />
          <Input
            label="Регион"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="RUS"
            hint="Пусто — цена для всех регионов"
          />
        </div>
        <Input
          label="Цена, ₽ *"
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          placeholder="10000"
        />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

// ──────────────────── цены отдельных представителей ────────────────────

function DealerPrices({
  items,
  dealers,
  initialDealerId,
}: {
  items: PriceItem[];
  dealers: PricingDealer[];
  initialDealerId?: string | null;
}) {
  const router = useRouter();
  const [dealerId, setDealerId] = React.useState<string>(
    dealers.find((d) => d.id === initialDealerId)?.id ?? dealers[0]?.id ?? "",
  );
  const dealer = dealers.find((d) => d.id === dealerId) ?? null;

  const [kind, setKind] = React.useState<AdjustKind>("NONE");
  const [value, setValue] = React.useState("");
  const [own, setOwn] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setKind(dealer?.adjustKind ?? "NONE");
    setValue(dealer?.adjustValue == null ? "" : String(dealer.adjustValue));
    setOwn(
      Object.fromEntries(dealer?.overrides.map((o) => [o.itemId, String(o.price)]) ?? []),
    );
  }, [dealer]);

  if (dealers.length === 0) {
    return (
      <Card>
        <div className="py-12 text-center text-sm text-ink-muted">
          Представителей пока нет.
        </div>
      </Card>
    );
  }

  const adjustValue = value.trim() === "" ? null : Number(value.replace(",", "."));

  async function save() {
    if (!dealer) return;
    if (kind !== "NONE" && (adjustValue === null || !Number.isFinite(adjustValue))) {
      toast.error("Укажите величину пересчёта");
      return;
    }
    // Пустое поле снимает личную цену — так позиция возвращается к справочнику.
    const overrides = items.map((item) => {
      const raw = own[item.id];
      if (raw === undefined || raw.trim() === "") return { itemId: item.id, price: null };
      return { itemId: item.id, price: Number(raw.replace(",", ".")) };
    });
    if (overrides.some((o) => o.price !== null && (!Number.isFinite(o.price) || o.price < 0))) {
      toast.error("Личная цена указана неверно");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/pricing/dealers/${dealer.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustKind: kind, adjustValue, overrides }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Не удалось сохранить");
      return;
    }
    toast.success("Цены представителя сохранены");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Представитель"
            value={dealerId}
            onChange={setDealerId}
            options={dealers.map((d) => ({ value: d.id, label: `${dealerName(d)} · ${d.email}` }))}
          />
          <Select
            label="Правило для всех продуктов"
            value={kind}
            onChange={(v) => setKind(v as AdjustKind)}
            options={ADJUST_OPTIONS}
          />
          {kind !== "NONE" ? (
            <Input
              label={kind === "PERCENT" ? "Процент" : "Сумма, ₽"}
              value={value}
              inputMode="decimal"
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "PERCENT" ? "10 или -15" : "1000 или -500"}
              hint="Отрицательное значение — скидка"
            />
          ) : null}
        </div>
      </Card>

      {items.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-sm text-ink-muted">
            Сначала заполните справочник — личные цены назначаются на его позиции.
          </div>
        </Card>
      ) : (
        <div className="rounded-panel border border-hairline overflow-hidden">
          <div className="overflow-x-auto scrollbar-clean">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-tight text-ink-subtle">
                  <th className="px-4 py-2.5 font-normal">Позиция</th>
                  <th className="px-4 py-2.5 font-normal">Справочник</th>
                  <th className="px-4 py-2.5 font-normal">С правилом</th>
                  <th className="px-4 py-2.5 font-normal">Личная цена</th>
                  <th className="px-4 py-2.5 font-normal">Итог</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline border-t border-hairline">
                {items.map((item) => {
                  const adjusted = withAdjust(item.price, kind, adjustValue);
                  const raw = own[item.id];
                  const personal =
                    raw !== undefined && raw.trim() !== "" ? Number(raw.replace(",", ".")) : null;
                  const total = personal !== null && Number.isFinite(personal) ? personal : adjusted;
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <div className="font-display tracking-tight">{item.product}</div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {[item.bundle || "без комплектаций", item.region || "все регионы"].join(
                            " · ",
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{rub(item.price)}</td>
                      <td className="px-4 py-3 text-ink-muted">
                        {kind === "NONE" ? "—" : rub(adjusted)}
                      </td>
                      <td className="px-4 py-3 w-[180px]">
                        <Input
                          value={raw ?? ""}
                          inputMode="decimal"
                          placeholder="по справочнику"
                          onChange={(e) => setOwn({ ...own, [item.id]: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-display tracking-tight">{rub(total)}</span>
                        {personal !== null ? (
                          <Tag tone="accent" className="ml-2">
                            личная
                          </Tag>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
          Сохранить цены представителя
        </Button>
      </div>
    </div>
  );
}
