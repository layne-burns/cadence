import { useState } from "react";
import { Header } from "./components/layout/Header";
import { BottomNav, type NavView } from "./components/layout/BottomNav";
import { CalendarScreen } from "./components/timeline/CalendarScreen";
import { NowAndNextCard } from "./components/focus/NowAndNextCard";
import { CheckInPrompt } from "./components/focus/CheckInPrompt";
import { AnalyticsScreen } from "./components/analytics/AnalyticsScreen";
import { WeeklyBlueprintGrid } from "./components/weekly/WeeklyBlueprintGrid";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { useCalendar } from "./hooks/useCalendar";
import { useSchedule } from "./hooks/useSchedule";
import { useTemplates } from "./hooks/useTemplates";
import { useSettings } from "./hooks/useSettings";
import { useSync } from "./hooks/useSync";
import { useTheme } from "./hooks/useTheme";
import { useNowTick } from "./hooks/useNowTick";
import { getCurrentAndNext } from "./engine/scheduler";
import type { RenderedBlock } from "./types/schedule";
import {
  formatDateLabel,
  formatDateRangeLabel,
  formatMonthLabel,
  minutesSinceMidnight,
  toIsoDate,
} from "./lib/time";

function App() {
  const [view, setView] = useState<NavView>("calendar");
  // The block awaiting an optional energy/friction follow-up, set after a
  // "Mark done" and cleared when answered or dismissed.
  const [pendingCheckIn, setPendingCheckIn] = useState<RenderedBlock | null>(null);
  const theme = useTheme();
  // One shared settings instance — the settings screen writes it and
  // useStreak reads it, so a separate copy would mean toggling an ignored
  // day didn't affect streak math until a reload.
  const settings = useSettings();
  // Subscribes to db-level change notifications itself — nothing needs to
  // tell it when to push. See hooks/useSync.ts.
  const sync = useSync();
  // One shared blueprint instance — Calendar, Focus, and the Blueprint
  // editor all read and (for the editor) write the same state, so an
  // edit shows up everywhere immediately instead of only after a reload.
  const templates = useTemplates();
  const calendar = useCalendar(templates);
  // Focus mode always tracks *today*, independent of whatever date the
  // Calendar tab is browsing — a separate useSchedule() instance whose
  // own date-nav methods are simply never called, so it stays pinned to
  // the date it initialized with.
  const focusToday = useSchedule(templates);
  // 30s rather than the spec's literal 1 minute — smooth enough for the
  // Now & Next progress ring to visibly move without excessive re-renders.
  const now = useNowTick(30_000);
  const nowMinutes = minutesSinceMidnight(now);
  const { current, next } = getCurrentAndNext(focusToday.instance, nowMinutes);
  const todayIso = toIsoDate(now);

  const calendarLabel =
    calendar.viewMode === "day"
      ? formatDateLabel(calendar.anchorDate)
      : calendar.viewMode === "month"
        ? formatMonthLabel(calendar.anchorDate)
        : formatDateRangeLabel(
            calendar.visibleDates[0] as string,
            calendar.visibleDates[calendar.visibleDates.length - 1] as string,
          );

  const HEADER_LABELS: Record<Exclude<NavView, "calendar">, string> = {
    focus: "Focus",
    analytics: "Analytics",
    blueprint: "Blueprint",
    settings: "Settings",
  };
  const headerLabel = view === "calendar" ? calendarLabel : HEADER_LABELS[view];

  return (
    // A fixed h-svh (not min-h-svh) is load-bearing here: main's flex-1 +
    // min-h-0 + overflow-y-auto only actually scrolls internally — instead
    // of the whole page growing past the viewport and pushing BottomNav
    // off-screen — if this container can't grow taller than the viewport
    // in the first place.
    <div className="flex h-svh flex-col">
      <Header
        label={headerLabel}
        showTodayLink={view === "calendar" && calendar.anchorDate !== todayIso}
        onPrev={view === "calendar" ? calendar.goPrev : undefined}
        onNext={view === "calendar" ? calendar.goNext : undefined}
        onToday={view === "calendar" ? calendar.goToday : undefined}
        syncStatus={sync.status}
        syncConfigured={sync.isConfigured}
        onOpenSync={() => setView("settings")}
      />

      {/* min-h-0 overrides the flex item's default auto min-height — without
          it, a flex child can't actually be constrained by overflow-y-auto;
          it just grows to fit content instead, and BottomNav gets pushed
          off-screen below a long day's timeline instead of staying pinned. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {view === "calendar" ? (
          <CalendarScreen calendar={calendar} templates={templates} now={now} />
        ) : view === "focus" ? (
          focusToday.loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
              Loading…
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-4">
              <div className="flex w-full max-w-sm flex-col gap-3">
                <NowAndNextCard
                  current={current}
                  next={next}
                  nowMinutes={nowMinutes}
                  currentCompleted={
                    current
                      ? (focusToday.getLogForBlock(current.id)?.completed ?? false)
                      : false
                  }
                  onMarkDone={(block) => {
                    // The check-in is complete right here. The follow-up
                    // below is purely additive — see CheckInPrompt.
                    void focusToday.logCheckIn(block, { completed: true });
                    setPendingCheckIn(block);
                  }}
                  onExtend={focusToday.extendBlock}
                  onSkip={(block) => focusToday.skipBlock(block, nowMinutes)}
                />
                {pendingCheckIn && (
                  <CheckInPrompt
                    key={pendingCheckIn.id}
                    blockTitle={pendingCheckIn.title}
                    onDismiss={() => setPendingCheckIn(null)}
                    onSubmit={(values) => {
                      void focusToday.logCheckIn(pendingCheckIn, {
                        completed: true,
                        ...values,
                      });
                      setPendingCheckIn(null);
                    }}
                  />
                )}
              </div>
            </div>
          )
        ) : view === "analytics" ? (
          <AnalyticsScreen templates={templates} settings={settings} />
        ) : view === "settings" ? (
          <SettingsScreen sync={sync} theme={theme} settings={settings} />
        ) : (
          <WeeklyBlueprintGrid templates={templates} />
        )}
      </main>

      <BottomNav active={view} onChange={setView} />
    </div>
  );
}

export default App;
