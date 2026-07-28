"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "theme";
const THEME_EVENT = "theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The stored preference — "system" when nothing has been chosen. */
function getSnapshot(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

/** What the preference actually means right now. */
function getResolvedSnapshot(): ResolvedTheme {
  const theme = getSnapshot();
  if (theme !== "system") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function subscribe(callback: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", callback);
  };
}

/**
 * Reads and writes the colour theme. The resolved value lives on
 * `<html data-theme>`, which is what globals.css selects on; the inline script
 * in app/layout.tsx sets the same attribute before first paint so the page
 * never flashes the wrong palette.
 */
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "system" as Theme
  );
  const resolved = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    () => "light" as ResolvedTheme
  );
  const setTheme = useCallback((next: Theme) => {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  return { theme, resolved, setTheme };
}

/** Mirrors the resolved theme onto <html> after the preference changes. */
export function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
}
