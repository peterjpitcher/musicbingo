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
    "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8";
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
