"use client";

import * as React from "react";
import { MapPin, RefreshCw } from "lucide-react";

export function GeoNotice() {
  const [city, setCity] = React.useState<string | null>(null);
  const [country, setCountry] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { city?: string | null; country?: string | null } | null) => {
        setCity(d?.city ?? null);
        setCountry(d?.country ?? null);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const place = city || country;

  return (
    <div className="mb-5 rounded-panel bg-[#fff6e6] p-4 text-sm">
      <div className="flex items-start gap-2.5">
        <MapPin className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div>
          <div className="text-ink">
            {place ? (
              <>
                Ваш город подключения — <b>{place}</b>?
              </>
            ) : (
              <>Не удалось определить ваш город подключения.</>
            )}{" "}
            Если это не так, <b>отключите VPN</b> и обновите страницу — при первой регистрации мы
            фиксируем ваш регион.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Обновить страницу
          </button>
        </div>
      </div>
    </div>
  );
}
