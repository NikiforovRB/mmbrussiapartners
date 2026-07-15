import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { auth } from "@/lib/auth";
import { getCabinetPath } from "@/lib/cabinet-path";

export default async function NotFound() {
  let cabinetHref: string | null = null;
  try {
    const session = await auth();
    if (session?.user) {
      cabinetHref = getCabinetPath(session.user);
    }
  } catch {
    cabinetHref = null;
  }

  return (
    <main className="min-h-screen grid-mesh grid place-items-center px-6">
      <div className="rounded-panel bg-white p-10 max-w-md w-full text-center">
        <div className="font-display text-7xl  tracking-tightest gradient-text">404</div>
        <div className="mt-3 text-ink-muted">Страница не найдена</div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {cabinetHref ? (
            <>
              <Link href={cabinetHref}>
                <Button icon={<LayoutDashboard className="h-4 w-4" />}>В кабинет</Button>
              </Link>
              <Link href="/">
                <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
                  На главную
                </Button>
              </Link>
            </>
          ) : (
            <Link href="/">
              <Button icon={<ArrowLeft className="h-4 w-4" />}>На главную</Button>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
