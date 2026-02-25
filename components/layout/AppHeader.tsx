import Image from "next/image";
import type { ReactNode } from "react";

type Variant = "light" | "dark";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: Variant;
};

export function AppHeader({
  title,
  subtitle,
  actions,
  variant = "light",
}: AppHeaderProps) {
  const isDark = variant === "dark";

  return (
    <header
      className={[
        "sticky top-0 z-20 flex items-center justify-between gap-5 px-6 py-4",
        isDark
          ? "bg-brand-green/95 border-b border-brand-gold/50 backdrop-blur-sm"
          : "bg-white/95 border-b border-slate-200 backdrop-blur-sm shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-center gap-3.5">
        <Image
          src={
            isDark
              ? "/the-anchor-pub-logo-white-transparent.png"
              : "/the-anchor-pub-logo-black-transparent.png"
          }
          alt="The Anchor"
          width={140}
          height={44}
          priority
          className="max-h-11 w-auto object-contain"
        />
        <div>
          <h1
            className={[
              "m-0 text-xl font-extrabold uppercase tracking-wide leading-tight",
              isDark ? "text-white" : "text-slate-900",
            ].join(" ")}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={[
                "m-0 mt-0.5 text-xs uppercase tracking-widest",
                isDark ? "text-white/70" : "text-slate-500",
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
