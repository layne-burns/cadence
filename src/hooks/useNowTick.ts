import { useEffect, useState } from "react";

/**
 * Re-renders whatever calls this once a minute (by default) with the
 * current time — the live pulse behind the day timeline's "now" line and
 * the Now & Next progress ring. Components that want a visibly smoother
 * progress bar can pass a shorter interval; the default matches the
 * spec's "1-minute live timer."
 */
export function useNowTick(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
