import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
