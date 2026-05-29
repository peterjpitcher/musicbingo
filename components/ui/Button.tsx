import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "success";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-gold hover:bg-brand-gold-light text-ink border-brand-gold-light shadow-sm",
  secondary:
    "bg-white/[0.06] hover:bg-white/[0.12] text-cream border-white/[0.16]",
  danger:
    "bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-400/60",
  success:
    "bg-emerald-600 hover:bg-emerald-500 text-emerald-50 border-emerald-400/70 shadow-sm",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm font-semibold",
};

function buildClassName(
  variant: Variant,
  size: Size,
  fullWidth: boolean,
  extra?: string
): string {
  return [
    "inline-flex items-center justify-center rounded-xl border",
    "font-semibold tracking-wide transition-colors cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? "w-full" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

// Button as a <button>
type ButtonAsButton = {
  as?: "button";
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} & ComponentPropsWithoutRef<"button">;

// Button as a Next.js <Link>
type ButtonAsLink = {
  as: "link";
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} & ComponentPropsWithoutRef<typeof Link>;

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  if (props.as === "link") {
    const { as: _as, variant = "secondary", size = "md", fullWidth = false, className, ...rest } = props;
    const cls = buildClassName(variant, size, fullWidth, className);
    return <Link className={cls} {...rest} />;
  }

  const { as: _as, variant = "secondary", size = "md", fullWidth = false, className, ...rest } = props;
  const cls = buildClassName(variant, size, fullWidth, className);
  return <button type="button" className={cls} {...rest} />;
}
