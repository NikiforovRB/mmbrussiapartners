"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, regionsFor } from "@/lib/geo-catalog";

export type LocationValue = { country: string; region: string; city: string };

const OUTSIDE_CATALOG = "нет в справочнике";

const countryName = (v: string) => findCountry(v)?.name ?? (v.trim() || DEFAULT_COUNTRY);

/**
 * Страна — из списка, регион — из списка страны с поиском (если у страны он
 * есть), город — вручную. Три поля без обёртки: раскладку задаёт форма.
 * Значения, сохранённые до появления справочника, остаются в списке.
 */
export function LocationFields({
  value,
  onChange,
  disabled,
  required = false,
  hint,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  disabled?: boolean;
  /** Звёздочка у подписей — поля обязательны. */
  required?: boolean;
  /** Подсказка под полем «Город». */
  hint?: string;
}) {
  const initial = React.useRef(value).current;
  const mark = required ? " *" : "";
  const country = countryName(value.country);
  const regions = regionsFor(country);

  const countryOptions = React.useMemo<SelectOption[]>(() => {
    const list = COUNTRIES.map((c) => ({
      value: c.name,
      label: c.name,
      search: [c.name, ...(c.aliases ?? []), c.code].join(" "),
    }));
    const old = initial.country.trim();
    return old && !findCountry(old) ? [{ value: old, label: old, hint: OUTSIDE_CATALOG }, ...list] : list;
  }, [initial]);

  const regionOptions = React.useMemo<SelectOption[] | null>(() => {
    if (!regions) return null;
    const list = regions.map((r) => ({ value: r.name, label: r.name }));
    const old = initial.region.trim();
    const outside = old && countryName(initial.country) === country && !regions.some((r) => r.name === old);
    return outside ? [{ value: old, label: old, hint: `${OUTSIDE_CATALOG} — выберите из списка` }, ...list] : list;
  }, [regions, country, initial]);

  return (
    <>
      <Select
        label={`Страна${mark}`}
        value={country}
        disabled={disabled}
        searchable
        searchPlaceholder="Найти страну"
        options={countryOptions}
        onChange={(next) => {
          if (next === country) return;
          onChange({ ...value, country: next, region: "" });
        }}
      />
      {regionOptions ? (
        <Select
          label={`Регион${mark}`}
          value={value.region || null}
          placeholder="Выберите регион"
          disabled={disabled}
          searchable
          searchPlaceholder="Найти регион"
          options={regionOptions}
          onChange={(region) => onChange({ ...value, region })}
        />
      ) : (
        <Input
          label={`Регион${mark}`}
          icon={<MapPin className="h-4 w-4" />}
          maxLength={120}
          disabled={disabled}
          value={value.region}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
        />
      )}
      <Input
        label={`Город${mark}`}
        maxLength={120}
        disabled={disabled}
        hint={hint}
        value={value.city}
        onChange={(e) => onChange({ ...value, city: e.target.value })}
      />
    </>
  );
}
