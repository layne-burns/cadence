import { formatMinutes } from "../../lib/time";

interface TimeGridRulerProps {
  wakeMinutes: number;
  windDownMinutes: number;
  pixelsPerMinute: number;
}

/** The hour labels running down the left edge of the day timeline. */
export function TimeGridRuler({
  wakeMinutes,
  windDownMinutes,
  pixelsPerMinute,
}: TimeGridRulerProps) {
  const hours: number[] = [];
  for (
    let minutes = Math.ceil(wakeMinutes / 60) * 60;
    minutes <= windDownMinutes;
    minutes += 60
  ) {
    hours.push(minutes);
  }

  return (
    <div className="relative w-14 shrink-0">
      {hours.map((minutes) => (
        <div
          key={minutes}
          className="absolute inset-x-0 -translate-y-1/2 pr-2 text-right text-xs text-neutral-400 dark:text-neutral-600"
          style={{ top: (minutes - wakeMinutes) * pixelsPerMinute }}
        >
          {formatMinutes(minutes)}
        </div>
      ))}
    </div>
  );
}
