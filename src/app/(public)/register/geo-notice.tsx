"use client";

import * as React from "react";
import { MapPin, RefreshCw } from "lucide-react";

type Geo = { city?: string | null; region?: string | null; country?: string | null };

export function GeoNotice() {
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Geo | null) => setGeo(d))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  // «Москва, Москва» читается как ошибка — повтор города в регионе опускаем.
  const parts = [geo?.city, geo?.region, geo?.country].filter((p): p is string => Boolean(p));
  const place = parts.filter((p, i) => parts.indexOf(p) === i).join(", ");

  return (
    <div className="mb-5 rounded-panel bg-[#fff6e6] p-4 text-sm">
      <div className="flex items-start gap-2.5">
        <MapPin className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div>
          <div className="text-ink">
            {place ? (
              <>
                Ваше местоположение — <b>{place}</b>?
              </>
            ) : (
              <>Не удалось определить ваше местоположение.</>
            )}{" "}
            Страну, регион и город мы определяем по IP-адресу при регистрации. Если они неверны,{" "}
            <b>отключите VPN</b> и обновите страницу. После одобрения их можно поправить в профиле.
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
