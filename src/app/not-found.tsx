import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen grid-mesh grid place-items-center px-6">
      <div className="rounded-panel bg-white p-10 max-w-md w-full text-center">
        <div className="font-display text-7xl  tracking-tightest gradient-text">404</div>
        <div className="mt-3 text-ink-muted">Страница не найдена</div>
        <div className="mt-6 flex justify-center">
          <Link href="/">
            <Button icon={<ArrowLeft className="h-4 w-4" />}>Вернуться</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
