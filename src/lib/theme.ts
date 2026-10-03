export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "mmb-theme";
const THEME_EVENT = "mmb-theme-change";
const THEME_COLOR = { light: "#ffffff", dark: "#0a0f1a" } as const;

/** Тёмная тема только у кабинетов: публичные страницы свёрстаны под светлую. */
export function isThemedPath(pathname: string): boolean {
  return /^\/(admin|dealer)(\/|$)/.test(pathname);
}

/**
 * Выполняется в <head> до первой отрисовки, иначе страница мигала бы светлой
 * темой. Логика та же, что у applyTheme.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})==="dark"&&/^\\/(admin|dealer)(\\/|$)/.test(location.pathname)){var r=document.documentElement;r.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(
  THEME_COLOR.dark,
)})}}catch(e){}})();`;

export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme, pathname: string): void {
  const dark = theme === "dark" && isThemedPath(pathname);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Приватный режим без localStorage: тема продержится до перезагрузки.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
