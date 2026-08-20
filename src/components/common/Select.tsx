import { useId, type SelectHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function Select({ label, id, className, children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={selectId}
        className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        {label}
      </label>
      <select
        id={selectId}
        className={cx(
          "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
