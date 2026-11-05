"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type GanttColumns = { name: number; due: number };

export const DEFAULT_GANTT_COLUMNS: GanttColumns = { name: 280, due: 116 };

const NAME_MIN = 120;
const NAME_MAX = 480;
const DUE_MIN = 108; // the widest date, plus the column's right padding
const DUE_MAX = 184;
// Timeline width kept visible, whatever the columns are dragged to. The Gantt's
// minimum width must leave room for this plus NAME_MIN, DUE_MAX and its padding.
const MIN_CHART = 240;

const COLUMNS_KEY = "gantt-columns";
const COLUMNS_EVENT = "gantt-columns-change";

function subscribe(callback: () => void) {
  window.addEventListener(COLUMNS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(COLUMNS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return localStorage.getItem(COLUMNS_KEY);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

/** A saved value may be stale or hand-edited, so trust nothing in it. */
function parse(raw: string | null): GanttColumns {
  if (!raw) return DEFAULT_GANTT_COLUMNS;
  try {
    const { name, due } = JSON.parse(raw);
    return {
      name: Number.isFinite(name) ? name : DEFAULT_GANTT_COLUMNS.name,
      due: Number.isFinite(due) ? due : DEFAULT_GANTT_COLUMNS.due,
    };
  } catch {
    return DEFAULT_GANTT_COLUMNS;
  }
}

/**
 * Widths that are valid for a chart `width` pixels wide. Applied at render too,
 * not only while dragging, because widths saved on a large window must still
 * leave room for the bars on a small one.
 */
export function clampColumns(
  cols: GanttColumns,
  width: number,
  rightPad: number
): GanttColumns {
  const due = clamp(cols.due, DUE_MIN, DUE_MAX);
  const nameMax = Math.min(NAME_MAX, width - rightPad - MIN_CHART - due);
  return { name: clamp(cols.name, NAME_MIN, nameMax), due };
}

/** The Gantt's column widths, remembered per browser like lang and theme. */
export function useGanttColumns() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const columns = useMemo(() => parse(raw), [raw]);
  const setColumns = useCallback((cols: GanttColumns) => {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols));
    window.dispatchEvent(new Event(COLUMNS_EVENT));
  }, []);
  return { columns, setColumns };
}
