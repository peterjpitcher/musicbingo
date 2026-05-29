import type { ComponentPropsWithoutRef } from "react";

type CardAs = "div" | "article" | "form" | "section";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  as?: CardAs;
  onSubmit?: ComponentPropsWithoutRef<"form">["onSubmit"];
};

export function Card({ children, className = "", as: Tag = "div", onSubmit }: CardProps) {
  const base =
    "bg-ink/60 rounded-2xl border border-brand-gold/30 shadow-[0_18px_50px_rgba(0,0,0,0.4)] p-6 sm:p-8 text-cream";
  const cls = [base, className].filter(Boolean).join(" ");

  if (Tag === "form") {
    return (
      <form className={cls} onSubmit={onSubmit}>
        {children}
      </form>
    );
  }

  return <Tag className={cls}>{children}</Tag>;
}
