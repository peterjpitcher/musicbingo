import Image from "next/image";
import type { ReactNode } from "react";

type Variant = "light" | "dark";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: Variant;
  logoDarkUrl?: string;
  logoLightUrl?: string;
  logoAlt?: string;
};

export function AppHeader({
  title,
  subtitle,
  actions,
  variant = "dark",
  logoDarkUrl,
  logoLightUrl,
  logoAlt,
}: AppHeaderProps) {
  const isDark = variant === "dark";

  return (
    <header
      className={[
        "sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4 backdrop-blur",
        isDark
          ? "bg-ink/85 border-b border-brand-gold/35"
          : "bg-white/95 border-b border-slate-200 shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-center gap-3.5">
        <Image
          src={
            isDark
              ? (logoDarkUrl ?? "/the-anchor-pub-logo-white-transparent.png")
              : (logoLightUrl ?? "/the-anchor-pub-logo-black-transparent.png")
          }
          alt={logoAlt ?? "Logo"}
          width={140}
          height={44}
          priority
          className="max-h-11 w-auto object-contain"
        />
        <div>
          <h1
            className={[
              "m-0 text-2xl font-display uppercase tracking-wide leading-none",
              isDark ? "text-cream" : "text-slate-900",
            ].join(" ")}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={[
                "m-0 mt-1 text-[11px] font-bold uppercase tracking-[0.28em]",
                isDark ? "text-brand-gold-light" : "text-slate-500",
              ].join(" ")}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>
      )}
    </header>
  );
}
