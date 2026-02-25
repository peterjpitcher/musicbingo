type Variant = "success" | "warning" | "error" | "info";

type NoticeProps = {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
};

const variantClasses: Record<Variant, string> = {
  success: "bg-emerald-50 border-emerald-300 text-emerald-800",
  warning: "bg-amber-50 border-amber-300 text-amber-800",
  error: "bg-red-50 border-red-300 text-red-800",
  info: "bg-sky-50 border-sky-300 text-sky-800",
};

export function Notice({ variant, children, className = "" }: NoticeProps) {
  const cls = [
    "rounded-xl border px-4 py-3 text-sm font-medium",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={cls}>{children}</div>;
}
