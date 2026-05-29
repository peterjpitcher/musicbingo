type BadgeProps = {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
};

export function Badge({ children, active = false, className = "" }: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide border transition-colors";
  const state = active
    ? "border-brand-gold-light bg-brand-gold/20 text-brand-gold-light"
    : "border-white/15 bg-black/20 text-cream/60";
  const cls = [base, state, className].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}
