import type { HTMLAttributes } from "react";
import { cx } from "../../lib/utils";

type BadgeVariant = "default" | "success" | "danger" | "brand" | "warning";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-burd-border bg-burd-badge text-burd-text-secondary",
  success:
    "border-[#274a2d] bg-[rgba(63,128,71,0.12)] text-burd-success",
  danger: "border-[#4a2626] bg-[rgba(179,71,71,0.12)] text-burd-danger",
  brand: "border-[rgba(31,126,166,0.35)] bg-[rgba(31,126,166,0.12)] text-burd-blue",
  warning: "border-[#5a4520] bg-[rgba(209,166,82,0.12)] text-[#d1a652]",
};

export function Badge({
  children,
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
