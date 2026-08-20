interface PlaceholderViewProps {
  title: string;
  description: string;
}

/** Honest "not built yet" screen for nav destinations whose real content
 * lands in a later phase (Analytics, Blueprint editor) — shown instead of
 * faking data or hiding the tab, so the app's actual state is never
 * misrepresented. */
export function PlaceholderView({ title, description }: PlaceholderViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
        {description}
      </p>
    </div>
  );
}
