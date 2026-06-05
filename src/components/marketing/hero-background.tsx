import { isHeroAnimatedBgEnabled } from "@/lib/hero-animation";

/** Статичный фон (как было до анимации) — используется при откате. */
export function HeroStaticBackground() {
  return (
    <>
      <div
        className="absolute -top-40 -right-40 h-[460px] w-[460px] rounded-full blob"
        style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.55), transparent)" }}
      />
      <div
        className="absolute -bottom-32 -left-32 h-[380px] w-[380px] rounded-full blob"
        style={{ background: "radial-gradient(closest-side, rgba(0,0,0,0.25), transparent)" }}
      />
    </>
  );
}

/** Едва заметные пульсации в синих и бирюзовых тонах. */
export function HeroAnimatedBackground() {
  return (
    <div className="hero-ambient pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="hero-ambient__orb hero-ambient__orb--1" />
      <div className="hero-ambient__orb hero-ambient__orb--2" />
      <div className="hero-ambient__orb hero-ambient__orb--3" />
      <div className="hero-ambient__orb hero-ambient__orb--4" />
      <div className="hero-ambient__orb hero-ambient__orb--5" />
      <div className="hero-ambient__orb hero-ambient__orb--6" />
      <div className="hero-ambient__veil" />
    </div>
  );
}

export function HeroBackground() {
  if (!isHeroAnimatedBgEnabled()) {
    return <HeroStaticBackground />;
  }
  return <HeroAnimatedBackground />;
}
