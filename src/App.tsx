import { useState } from "react";
import { Header } from "./components/layout/Header";
import { BottomNav, type NavView } from "./components/layout/BottomNav";
import { DayView } from "./components/timeline/DayView";
import { NowAndNextCard } from "./components/focus/NowAndNextCard";
import { PlaceholderView } from "./components/common/PlaceholderView";
import { useSchedule } from "./hooks/useSchedule";
import { useNowTick } from "./hooks/useNowTick";
import { getCurrentAndNext } from "./engine/scheduler";
import { minutesSinceMidnight } from "./lib/time";

function App() {
  const [view, setView] = useState<NavView>("today");
  const schedule = useSchedule();
  // 30s rather than the spec's literal 1 minute — smooth enough for the
  // Now & Next progress ring to visibly move without excessive re-renders.
  const now = useNowTick(30_000);
  const nowMinutes = minutesSinceMidnight(now);
  const { current, next } = getCurrentAndNext(schedule.instance, nowMinutes);

  return (
    // A fixed h-svh (not min-h-svh) is load-bearing here: main's flex-1 +
    // min-h-0 + overflow-y-auto only actually scrolls internally — instead
    // of the whole page growing past the viewport and pushing BottomNav
    // off-screen — if this container can't grow taller than the viewport
    // in the first place.
    <div className="flex h-svh flex-col">
      <Header
        date={schedule.date}
        isToday={schedule.isToday}
        onPrevDay={schedule.goToPreviousDay}
        onNextDay={schedule.goToNextDay}
        onToday={schedule.goToToday}
      />

      {/* min-h-0 overrides the flex item's default auto min-height — without
          it, a flex child can't actually be constrained by overflow-y-auto;
          it just grows to fit content instead, and BottomNav gets pushed
          off-screen below a long day's timeline instead of staying pinned. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {schedule.loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
            Loading…
          </div>
        ) : view === "today" ? (
          <DayView
            instance={schedule.instance}
            isToday={schedule.isToday}
            now={now}
            getLogForBlock={schedule.getLogForBlock}
            onToggleComplete={schedule.toggleComplete}
            onAddEvent={schedule.addEvent}
          />
        ) : view === "focus" ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="w-full max-w-sm">
              <NowAndNextCard
                current={current}
                next={next}
                nowMinutes={nowMinutes}
                currentCompleted={
                  current ? (schedule.getLogForBlock(current.id)?.completed ?? false) : false
                }
                onMarkDone={(block) => void schedule.logCheckIn(block, { completed: true })}
                onExtend={schedule.extendBlock}
                onSkip={(block) => schedule.skipBlock(block, nowMinutes)}
              />
            </div>
          </div>
        ) : view === "analytics" ? (
          <PlaceholderView
            title="Analytics"
            description="The drop-off heatmap, category breakdown, and consistency trend land in Phase 6."
          />
        ) : (
          <PlaceholderView
            title="Blueprint editor"
            description="The weekly template builder — setting up your recurring routine — lands in Phase 6. Add one-off events from Today for now."
          />
        )}
      </main>

      <BottomNav active={view} onChange={setView} />
    </div>
  );
}

export default App;
