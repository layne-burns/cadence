import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { cx } from "../../lib/cx";
import type { EnergyLevel } from "../../types/adherence";

/** Fixed, tappable options rather than a free-text box. Typing a reason
 * is exactly the kind of friction that stops someone logging at all; the
 * point is one more tap, not a journalling exercise. Free text stays
 * possible in the data model for later. */
const FRICTION_OPTIONS = [
  "Great flow",
  "Distracted",
  "Underestimated time",
  "Low energy",
  "Interrupted",
] as const;

const ENERGY_LEVELS: readonly EnergyLevel[] = [1, 2, 3, 4, 5];

interface CheckInPromptProps {
  blockTitle: string;
  onSubmit: (values: { energyLevel?: EnergyLevel; frictionNote?: string }) => void;
  onDismiss: () => void;
}

/**
 * The optional follow-up after marking something done. This exists
 * because the energy/friction fields have been in the data model since
 * the original spec and nothing ever collected them, so the analytics
 * could only ever show *that* you dropped off, never *why*.
 *
 * Deliberately off the fast path: "Mark done" completes the check-in on
 * its own and this appears afterwards, fully ignorable. For an ADHD tool
 * specifically, taxing the one interaction that has to stay effortless
 * would trade a little insight for the whole habit.
 */
export function CheckInPrompt({ blockTitle, onSubmit, onDismiss }: CheckInPromptProps) {
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [friction, setFriction] = useState<string | null>(null);

  const hasAnswer = energy !== null || friction !== null;

  return (
    <Card className="relative flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Skip"
        className="absolute right-2 top-2 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <X className="size-4" />
      </button>

      <div>
        <p className="text-sm font-medium">How did that go?</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {blockTitle} · optional
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-neutral-500 dark:text-neutral-400">Energy</p>
        <div className="flex gap-1.5">
          {ENERGY_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={energy === level}
              onClick={() => setEnergy(energy === level ? null : level)}
              className={cx(
                "size-9 rounded-lg border text-sm font-medium transition-colors",
                energy === level
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400",
              )}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          Anything notable?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FRICTION_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={friction === option}
              onClick={() => setFriction(friction === option ? null : option)}
              className={cx(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                friction === option
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Skip
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!hasAnswer}
          onClick={() =>
            onSubmit({
              energyLevel: energy ?? undefined,
              frictionNote: friction ?? undefined,
            })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
