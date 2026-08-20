import { Check, ChevronRight, Plus } from "lucide-react";
import type { RenderedBlock } from "../../types/schedule";
import { Button } from "../common/Button";
import { Card } from "../common/Card";
import { LiveProgressRing } from "./LiveProgressRing";
import { formatMinutes } from "../../lib/time";

interface NowAndNextCardProps {
  current: RenderedBlock | null;
  next: RenderedBlock | null;
  nowMinutes: number;
  currentCompleted: boolean;
  onMarkDone: (block: RenderedBlock) => void;
  onExtend: (block: RenderedBlock, minutes: number) => void;
  onSkip: (block: RenderedBlock) => void;
}

/** The distraction-free focus widget: current task front and center, next
 * task as a quiet footnote, three quick actions and nothing else. */
export function NowAndNextCard({
  current,
  next,
  nowMinutes,
  currentCompleted,
  onMarkDone,
  onExtend,
  onSkip,
}: NowAndNextCardProps) {
  if (!current && !next) {
    return (
      <Card className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Nothing scheduled right now. Enjoy the open time.
      </Card>
    );
  }

  if (!current) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Up next</p>
        <p className="text-xl font-medium">{next?.title}</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          starts at {next ? formatMinutes(next.startMinutes) : ""}
        </p>
      </Card>
    );
  }

  const duration = current.endMinutes - current.startMinutes;
  const elapsed = Math.min(Math.max(nowMinutes - current.startMinutes, 0), duration);
  const progress = duration > 0 ? elapsed / duration : 0;

  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Now
      </p>
      <div className="relative flex items-center justify-center">
        <LiveProgressRing progress={progress} />
        <span className="absolute text-sm font-medium text-neutral-500 dark:text-neutral-400">
          until {formatMinutes(current.endMinutes)}
        </span>
      </div>
      <h2 className="text-2xl font-semibold">{current.title}</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {formatMinutes(current.startMinutes)} – {formatMinutes(current.endMinutes)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onExtend(current, 10)}>
          <Plus className="size-4" /> 10 min
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onMarkDone(current)}
          disabled={currentCompleted}
        >
          <Check className="size-4" /> {currentCompleted ? "Done" : "Mark done"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onSkip(current)}>
          Skip <ChevronRight className="size-4" />
        </Button>
      </div>

      {next && (
        <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-600">
          Next: {next.title} at {formatMinutes(next.startMinutes)}
        </p>
      )}
    </Card>
  );
}
