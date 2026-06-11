import { useState } from "react";
import { cx } from "../../lib/utils";

interface BurdLogoProps {
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
}

export function BurdLogo({
  alt = "Burd",
  className,
  fallbackClassName,
  imageClassName,
}: BurdLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={cx("inline-flex items-center", className)}>
      {failed ? (
        <span
          className={cx(
            "text-[14px] font-medium tracking-[0.01em] text-burd-text",
            fallbackClassName,
          )}
        >
          Burd
        </span>
      ) : (
        <img
          src="/burd-logo.svg"
          alt={alt}
          draggable={false}
          className={cx("h-6 w-auto select-none", imageClassName)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
