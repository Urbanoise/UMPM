"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The palette actually in effect. */
export type Theme = "light" | "dark";
/** What the user picked; "system" defers to the OS preference. */
export type ThemeChoice = Theme | "system";

export const THEME_KEY = "theme";
const THEME_EVENT = "theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The stored preference. Nothing stored means "system", which is the default:
 * only an explicit pick from the toggle is written to localStorage.
 */
function getChoice(): ThemeChoice {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "dark" || stored === "light" ? stored : "system";
}

function subscribeChoice(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribeSystemTheme(callback: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/**
 * Reads and writes the colour theme. `choice` is what the user picked and
 * `theme` is what that resolves to — they differ only while the choice is
 * "system", in which case the OS setting decides and a change to it re-renders
 * here. The resolved value lives on `<html data-theme>`, which is what
 * globals.css selects on; the inline script in app/layout.tsx resolves the
 * same way before first paint so the page never flashes the wrong palette.
 */
export function useTheme() {
  const choice = useSyncExternalStore(
    subscribeChoice,
    getChoice,
    () => "system" as ThemeChoice
  );
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    () => "light" as Theme
  );
  const setTheme = useCallback((next: ThemeChoice) => {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  return {
    choice,
    theme: choice === "system" ? systemTheme : choice,
    setTheme,
  };
}

/** Mirrors the resolved theme onto <html> after it changes. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
