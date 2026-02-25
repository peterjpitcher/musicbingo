import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-gold hover:bg-brand-gold-light text-white border-transparent shadow-sm",
  secondary:
    "bg-white hover:bg-slate-50 text-slate-800 border-slate-300 hover:border-slate-400",
  danger:
    "bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm",
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
