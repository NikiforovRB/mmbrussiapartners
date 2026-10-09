"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { LocationFields, type LocationValue } from "@/components/cabinet/location-fields";
import { findCountry, regionsFor } from "@/lib/geo-catalog";

type Geo = { city?: string | null; region?: string | null; country?: string | null };

/**
 * Страна, регион и город дилера — обязательные поля регистрации. Подставляем
 * их по IP-адресу, дилер поправляет на форме (чаще всего город). После
 * регистрации их меняет только администратор.
 */
export function RegistrationLocation({
  value,
  onChange,
  error,
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  error?: string | null;
}) {
  const [detected, setDetected] = React.useState<boolean | null>(null);
  const touched = React.useRef(false);
  const latest = React.useRef(value);
  latest.current = value;

  React.useEffect(() => {
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Geo | null) => {
        const found = Boolean(d?.city || d?.region || d?.country);
        setDetected(found);
        if (found && !touched.current) {
          // Регион не из справочника страны не подставляем: его выберут из списка.
          const country = findCountry(d?.country ?? "")?.name ?? latest.current.country;
          const regions = regionsFor(country);
          const region = d?.region && (!regions || regions.some((r) => r.name === d.region)) ? d.region : "";
          onChange({ country, region, city: d?.city ?? "" });
        }
      })
      .catch(() => setDetected(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-panel border border-hairline p-4">
      <div className="flex items-start gap-2.5 text-sm">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-ink-muted">
          {detected === false
            ? "Не удалось определить местоположение по IP-адресу — укажите страну, регион и город."
            : "Страну, регион и город мы подставили по IP-адресу. Проверьте их и при необходимости поправьте — особенно город. С VPN адрес может определиться неверно."}{" "}
          После регистрации изменить их сможет только администратор.
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <LocationFields
          required
          value={value}
          onChange={(next) => {
            touched.current = true;
            onChange(next);
          }}
        />
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <input type="hidden" name="country" value={value.country} />
      <input type="hidden" name="region" value={value.region} />
      <input type="hidden" name="city" value={value.city} />
    </div>
  );
}
