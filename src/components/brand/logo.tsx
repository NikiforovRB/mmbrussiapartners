import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  className?: string;
  height?: number;
};

/** Исходник 451×115: хватает на 3× экраны при высоте до ~38px. */
const LOGO_RATIO = 451 / 115;

export function Logo({ href = "/", className, height = 32 }: LogoProps) {
  // Без оптимизатора: пережатый в WebP мелкий вариант размывает тонкие линии логотипа.
  // Для тёмной темы — копия со светлым силуэтом машины и «MMB».
  const image = (
    <>
      <Image
        src="/images/logo-main.png"
        alt="MMB RUSSIA"
        width={Math.round(height * LOGO_RATIO)}
        height={height}
        unoptimized
        className={cn("object-contain dark:hidden", className)}
        style={{ height, width: "auto" }}
        priority
      />
      <Image
        src="/images/logo-main-dark.png"
        alt="MMB RUSSIA"
        width={Math.round(height * LOGO_RATIO)}
        height={height}
        unoptimized
        className={cn("hidden object-contain dark:block", className)}
        style={{ height, width: "auto" }}
      />
    </>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center shrink-0">
        {image}
      </Link>
    );
  }

  return image;
}
