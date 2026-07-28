"use client";

import { useSyncExternalStore } from "react";

export type UiLang = "en" | "ge";

// Georgian is "ka" in BCP-47 (browser locales), but accept a "ge" prefix too
// in case the language toggle writes the country code instead.
function getSnapshot(): UiLang {
  const raw = (
    document.documentElement.lang ||
    navigator.language ||
    "en"
  ).toLowerCase();
  return raw.startsWith("ka") || raw.startsWith("ge") ? "ge" : "en";
}

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  window.addEventListener("languagechange", callback);
  return () => {
    observer.disconnect();
    window.removeEventListener("languagechange", callback);
  };
}

// Resolves the active UI language: the <html lang> attribute when set (the
// GEO/ENG toggle writes "ka"/"en" there), otherwise the browser locale.
// Re-renders live when the toggle changes the attribute.
export function useUiLang(): UiLang {
  return useSyncExternalStore(subscribe, getSnapshot, () => "ge" as UiLang);
}
