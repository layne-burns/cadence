/**
 * Owns the `.dark` class on `<html>` that `src/index.css`'s
 * `@custom-variant dark` keys off. Until this existed, every component's
 * `dark:` styling was correct but unreachable — nothing ever added the
 * class, so the app was light-only in practice despite being fully
 * dark-mode-styled.
 *
 * Three-state preference rather than a boolean toggle: "system" (follow
 * the OS, and keep following it if the OS flips mid-session) is the
 * default and a distinct state from explicitly choosing light or dark.
 * A boolean can't represent "follow the OS" — it would freeze whatever
 * the OS happened to say at first load.
 *
 * The initial class is applied by an inline script in `index.html` before
 * first paint, so there's no flash of the wrong theme on load; this hook
 * takes over from there and must use the same localStorage key.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "cadence.theme";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function loadStoredPreference(): ThemePreference {
  const stored = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  return isThemePreference(stored) ? stored : "system";
}

function prefersDark(): boolean {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyThemeClass(preference: ThemePreference): void {
  const isDark = preference === "dark" || (preference === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

export interface UseThemeResult {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** What's actually rendering right now, after resolving "system". */
  resolved: "light" | "dark";
}

export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(prefersDark);

  // Only meaningful while preference is "system", but the listener is
  // registered unconditionally — it's cheap, and keeping `systemIsDark`
  // accurate at all times means switching back to "system" resolves
  // correctly without waiting for the next OS change.
  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyThemeClass(preference);
  }, [preference, systemIsDark]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  }, []);

  return {
    preference,
    setPreference,
    resolved:
      preference === "dark" || (preference === "system" && systemIsDark) ? "dark" : "light",
  };
}
