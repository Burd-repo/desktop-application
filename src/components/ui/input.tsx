import {
  forwardRef,
  type InputHTMLAttributes,
} from "react";
import { cx } from "../../lib/utils";

export const inputClasses =
  "h-[53px] w-full rounded-[10px] border border-burd-border bg-burd-panel px-4 text-[14px] text-burd-text placeholder:text-[#6b6b6b] transition hover:border-burd-border-soft focus:border-burd-blue";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  inputClassName?: string;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      description,
      inputClassName,
      label,
      wrapperClassName,
      ...props
    },
    ref,
  ) => {
    return (
      <label className={cx("block space-y-2", wrapperClassName)}>
        {label ? (
          <span className="font-mono text-[13px] uppercase tracking-[0.04em] text-burd-text">
            {label}
          </span>
        ) : null}

        <input
          ref={ref}
          className={cx(inputClasses, inputClassName, className)}
          {...props}
        />

        {description ? (
          <span className="block text-[13px] leading-6 text-burd-text-secondary">
            {description}
          </span>
        ) : null}
      </label>
    );
  },
);

Input.displayName = "Input";
