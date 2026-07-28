"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_KEY = "theme";
const THEME_EVENT = "theme-change";

/** The stored preference. Light is the default until dark is chosen. */
function getSnapshot(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Reads and writes the colour theme. The value lives on `<html data-theme>`,
 * which is what globals.css selects on; the inline script in app/layout.tsx
 * sets the same attribute before first paint so the page never flashes the
 * wrong palette.
 */
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "light" as Theme
  );
  const setTheme = useCallback((next: Theme) => {
    if (next === "dark") localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  return { theme, setTheme };
}

/** Mirrors the preference onto <html> after it changes. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
