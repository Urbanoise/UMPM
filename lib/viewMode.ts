"use client";

import { useCallback, useSyncExternalStore } from "react";

export type DashboardView = "gantt" | "board" | "list";

export const DASHBOARD_VIEWS: DashboardView[] = ["gantt", "board", "list"];

const VIEW_KEY = "dashboard-view";
const VIEW_EVENT = "dashboard-view-change";

function subscribe(callback: () => void) {
  window.addEventListener(VIEW_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(VIEW_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): DashboardView {
  const saved = localStorage.getItem(VIEW_KEY);
  return DASHBOARD_VIEWS.find((v) => v === saved) ?? "gantt";
}

/** The dashboard's current view, remembered per browser like lang and theme. */
export function useDashboardView() {
  const view = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "gantt" as DashboardView
  );
  const setView = useCallback((v: DashboardView) => {
    localStorage.setItem(VIEW_KEY, v);
    window.dispatchEvent(new Event(VIEW_EVENT));
  }, []);
  return { view, setView };
}
