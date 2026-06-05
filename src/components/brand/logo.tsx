import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  className?: string;
  height?: number;
};

export function Logo({ href = "/", className, height = 32 }: LogoProps) {
  const image = (
    <Image
      src="/images/logo-main.png"
      alt="MMB RUSSIA"
      width={Math.round(height * 3.2)}
      height={height}
      className={cn("h-auto w-auto object-contain", className)}
      style={{ height, width: "auto" }}
      priority
    />
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
