type BadgeProps = {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
};

export function Badge({ children, active = false, className = "" }: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border transition-colors";
  const state = active
    ? "border-brand-gold bg-amber-50 text-amber-800"
    : "border-slate-200 bg-slate-100 text-slate-600";
  const cls = [base, state, className].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}
