import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** A category/event color to tint the badge with, instead of the
   * neutral default — used for category tags. */
  color?: string;
}

export function Badge({ className, children, color, style, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        !color &&
          "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
        className,
      )}
      style={color ? { backgroundColor: `${color}22`, color, ...style } : style}
      {...rest}
    >
      {children}
    </span>
  );
}
