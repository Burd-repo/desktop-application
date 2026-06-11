import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cx } from "../../lib/utils";

type ButtonVariant = "panel" | "inverse" | "social" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  endIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  panel:
    "border border-burd-border bg-burd-badge text-burd-text hover:border-[#333333] hover:bg-burd-muted",
  inverse:
    "border border-burd-light bg-burd-light text-burd-page hover:border-white hover:bg-white",
  social:
    "border border-burd-border bg-[#171717] text-burd-text hover:border-burd-border-soft hover:bg-[#1e1e1e]",
  ghost:
    "border border-transparent bg-transparent text-burd-text-secondary hover:border-burd-border hover:bg-burd-panel",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-10 px-4 text-[14px]",
  lg: "h-[53px] px-4 text-[14px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      disabled,
      endIcon,
      fullWidth,
      icon,
      size = "md",
      type = "button",
      variant = "panel",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cx(
          "relative inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-[10px] font-mono uppercase tracking-[0.02em] transition",
          "disabled:cursor-not-allowed disabled:border-burd-border disabled:bg-[#171717] disabled:text-burd-text-tertiary disabled:hover:bg-[#171717]",
          fullWidth && "w-full",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {icon ? <span className="relative z-10 shrink-0">{icon}</span> : null}
        <span className="relative z-10">{children}</span>
        {endIcon ? <span className="relative z-10 shrink-0">{endIcon}</span> : null}
      </button>
    );
  },
);

Button.displayName = "Button";
