/**
 * Фоновая анимация первого экрана главной страницы.
 *
 * Откат: в `.env` установите
 *   NEXT_PUBLIC_HERO_ANIMATED_BG=false
 * и перезапустите dev-сервер.
 */
export function isHeroAnimatedBgEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HERO_ANIMATED_BG !== "false";
}
