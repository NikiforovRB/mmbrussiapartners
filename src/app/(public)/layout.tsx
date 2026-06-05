import { Logo } from "@/components/brand/logo";

export default function PublicAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 grid-mesh" />
      <div className="absolute -top-32 -left-20 h-[420px] w-[420px] rounded-full blob"
        style={{ background: "radial-gradient(closest-side, rgba(42,159,255,0.45), transparent)" }} />
      <div className="absolute -bottom-32 -right-32 h-[420px] w-[420px] rounded-full blob"
        style={{ background: "radial-gradient(closest-side, rgba(0,0,0,0.18), transparent)" }} />
      <header className="relative z-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 h-20 flex items-center justify-between">
          <Logo height={32} />
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl px-6 lg:px-10 pb-20">
        {children}
      </main>
    </div>
  );
}
