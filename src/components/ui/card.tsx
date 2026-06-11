import type { HTMLAttributes } from "react";
import { cx } from "../../lib/utils";

type CardVariant = "panel" | "deep" | "alt";
type CardPadding = "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantClasses: Record<CardVariant, string> = {
  panel: "border border-burd-border bg-burd-panel",
  deep: "border border-burd-border-panel bg-burd-panel-deep",
  alt: "border border-burd-border bg-burd-panel-alt",
};

const paddingClasses: Record<CardPadding, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  children,
  className,
  padding = "md",
  variant = "panel",
  ...props
}: CardProps) {
  return (
    <div
      className={cx(
        "rounded-tile shadow-panel",
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
