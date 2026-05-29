type Variant = "success" | "warning" | "error" | "info";

type NoticeProps = {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
};

const variantClasses: Record<Variant, string> = {
  success: "bg-emerald-500/15 border-emerald-400/50 text-emerald-200",
  warning: "bg-amber-500/15 border-amber-400/50 text-amber-200",
  error: "bg-red-500/15 border-red-400/50 text-red-200",
  info: "bg-sky-500/15 border-sky-400/50 text-sky-200",
};

export function Notice({ variant, children, className = "" }: NoticeProps) {
  const cls = [
    "rounded-xl border px-4 py-3 text-sm font-medium",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const role = variant === "error" || variant === "warning" ? "alert" : "status";
  return <div className={cls} role={role}>{children}</div>;
}
