"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export type CabinetUser = {
  name: string;
  email: string;
  role: string;
  /** Подписанная ссылка на аватар, полученная на сервере. */
  avatarUrl: string | null;
  /** Корень кабинета: /admin или /dealer. */
  basePath: string;
  /** Непрочитанные уведомления на момент рендера страницы. */
  unreadCount: number;
  permissions: string[];
  isSuperAdmin: boolean;
};

export type UnreadApi = {
  unread: number;
  setUnread: React.Dispatch<React.SetStateAction<number>>;
  /** Подтягивает число с сервера. */
  refresh: () => Promise<void>;
  /**
   * Запоминает момент перед запросом за числом; возвращённая функция применит
   * ответ, только если за это время не было отметок «прочитано».
   */
  track: () => (count: number) => void;
  /** Оборачивает отметку «прочитано»: пока она идёт, ответы опроса отбрасываются. */
  mutate: <T>(request: () => Promise<T>) => Promise<T | undefined>;
};

/** Как часто подтягиваем счётчик, пока вкладка на экране. */
const POLL_MS = 120_000;
/** При возврате на вкладку обновляем счётчик, если он старше этого. */
const STALE_ON_FOCUS_MS = 30_000;

const CabinetUserContext = React.createContext<CabinetUser | null>(null);
const UnreadContext = React.createContext<UnreadApi | null>(null);

/**
 * Последнее известное клиенту число непрочитанных. Переживает смену кабинета:
 * раскладка при этом монтируется заново и может прийти из кэша роутера со
 * старым числом, поэтому серверному числу верим только при первой загрузке.
 */
let knownUnread: { owner: string; count: number } | null = null;

/**
 * Раскладка кабинета уже читает пользователя из базы, поэтому шапке незачем
 * повторно дёргать /api/auth/session и /api/profile/avatar на каждой странице —
 * всё нужное приходит сюда с сервера.
 */
export function CabinetUserProvider({
  value,
  children,
}: {
  value: CabinetUser;
  children: React.ReactNode;
}) {
  const owner = value.email;
  const [unread, setUnread] = React.useState(() =>
    knownUnread?.owner === owner ? knownUnread.count : value.unreadCount,
  );
  React.useEffect(() => {
    knownUnread = { owner, count: unread };
  }, [owner, unread]);

  const mutations = React.useRef({ inFlight: 0, seq: 0 });

  const track = React.useCallback(() => {
    const seq = mutations.current.seq;
    const blocked = mutations.current.inFlight > 0;
    return (count: number) => {
      if (blocked || mutations.current.inFlight > 0 || mutations.current.seq !== seq) return;
      setUnread(count);
    };
  }, []);

  const lastRefresh = React.useRef(0);
  const refresh = React.useCallback(async () => {
    lastRefresh.current = Date.now();
    const commit = track();
    try {
      const res = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number };
      commit(data.unread);
    } catch {
      /* сеть моргнула — оставляем прежнее число */
    }
  }, [track]);

  const mutate = React.useCallback(async <T,>(request: () => Promise<T>) => {
    mutations.current.inFlight += 1;
    mutations.current.seq += 1;
    try {
      return await request();
    } catch {
      return undefined;
    } finally {
      mutations.current.inFlight -= 1;
      mutations.current.seq += 1;
    }
  }, []);

  // Каждый переход сверяет число с базой: так его не собьёт ни кэш роутера,
  // ни уведомление, пришедшее, пока открыт другой раздел.
  const pathname = usePathname();
  React.useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  // Фоновые вкладки базу не нагружают.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh.current > STALE_ON_FOCUS_MS) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const api = React.useMemo<UnreadApi>(
    () => ({ unread, setUnread, refresh, track, mutate }),
    [unread, refresh, track, mutate],
  );

  return (
    <CabinetUserContext.Provider value={value}>
      <UnreadContext.Provider value={api}>{children}</UnreadContext.Provider>
    </CabinetUserContext.Provider>
  );
}

export function useCabinetUser(): CabinetUser | null {
  return React.useContext(CabinetUserContext);
}

const noopTrack = () => () => {};

/**
 * Счётчик непрочитанных уведомлений. Хранится в раскладке: шапка монтируется
 * заново на каждой странице, и собственное состояние у неё сбрасывалось бы к
 * числу из первого рендера раскладки — прочитанные снова считались бы новыми.
 */
export function useUnreadCount(fallback: number): UnreadApi {
  const shared = React.useContext(UnreadContext);
  const [local, setLocal] = React.useState(fallback);
  const standalone = React.useMemo<UnreadApi>(
    () => ({
      unread: local,
      setUnread: setLocal,
      refresh: async () => {},
      track: noopTrack,
      mutate: async (request) => {
        try {
          return await request();
        } catch {
          return undefined;
        }
      },
    }),
    [local],
  );
  return shared ?? standalone;
}
