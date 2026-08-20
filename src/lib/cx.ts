/** Tiny classname joiner — join truthy class strings, skip the rest.
 * Not pulling in `clsx`/`tailwind-merge` for something this small. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
