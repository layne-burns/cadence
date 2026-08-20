import { CalendarDays, LineChart, ListChecks, Settings, Target } from "lucide-react";
import type { ComponentType } from "react";
import { cx } from "../../lib/cx";

export type NavView = "calendar" | "focus" | "analytics" | "blueprint" | "settings";

interface Tab {
  id: NavView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// Settings sits last so it lands bottom-right, where a settings affordance
// is conventionally reached for and where a thumb finds it on a phone.
const TABS: readonly Tab[] = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "focus", label: "Focus", icon: Target },
  { id: "analytics", label: "Analytics", icon: LineChart },
  { id: "blueprint", label: "Blueprint", icon: ListChecks },
  { id: "settings", label: "Settings", icon: Settings },
];

interface BottomNavProps {
  active: NavView;
  onChange: (view: NavView) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="flex border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
          className={cx(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium",
            active === id
              ? "text-indigo-500"
              : "text-neutral-400 dark:text-neutral-600",
          )}
        >
          <Icon className="size-5" />
          {label}
        </button>
      ))}
    </nav>
  );
}
