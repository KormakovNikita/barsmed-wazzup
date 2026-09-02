import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "full" | "icon";
  className?: string;
  href?: string;
  subtitle?: string;
}

export function BrandLogo({
  variant = "full",
  className,
  href,
  subtitle,
}: BrandLogoProps) {
  const content =
    variant === "icon" ? (
      <Image
        src="/branding/logo-icon.png"
        alt="БАРСМЕД"
        width={36}
        height={36}
        className="h-9 w-9 object-contain"
        priority
      />
    ) : (
      <Image
        src="/branding/logo-full.png"
        alt="БАРСМЕД"
        width={160}
        height={40}
        className="h-9 w-auto object-contain object-left"
        priority
      />
    );

  const block = (
    <div className={cn("flex items-center gap-3", className)}>
      {content}
      {subtitle && (
        <p className="text-[10px] leading-tight text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={cn("block shrink-0", className)}>
        {content}
      </Link>
    );
  }

  return block;
}
