interface LiveProgressRingProps {
  /** 0 = just started, 1 = finished. Clamped internally so a nudge that
   * pushes `now` past a block's end doesn't overshoot the ring visually. */
  progress: number;
  size?: number;
  strokeWidth?: number;
}

export function LiveProgressRing({
  progress,
  size = 112,
  strokeWidth = 8,
}: LiveProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);
  const dashOffset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      role="img"
      aria-label={`${Math.round(clamped * 100)}% through this block`}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        className="fill-none stroke-neutral-200 dark:stroke-neutral-800"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        className="fill-none stroke-indigo-500 transition-[stroke-dashoffset] duration-500 ease-linear"
      />
    </svg>
  );
}
