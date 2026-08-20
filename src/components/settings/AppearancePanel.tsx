import { Button } from "../common/Button";
import type { ThemePreference, UseThemeResult } from "../../hooks/useTheme";

const OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

interface AppearancePanelProps {
  theme: UseThemeResult;
}

export function AppearancePanel({ theme }: AppearancePanelProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Appearance</h3>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={theme.preference === option.id ? "primary" : "secondary"}
            onClick={() => theme.setPreference(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
