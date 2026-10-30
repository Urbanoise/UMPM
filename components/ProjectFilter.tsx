"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { useLang } from "@/lib/i18n";

/**
 * The multi-select project filter shared by the timeline and the two overview
 * panels. Dashboard owns the value, so ticking projects in any one of them
 * narrows all three; an empty set means "all projects". Each panel passes the
 * ids it can actually show as `relevant` so its own list never offers an
 * option that filters down to nothing there.
 */
export default function ProjectFilter({
  projects,
  relevant,
  value,
  onChange,
}: {
  projects: Project[];
  relevant: Set<number>;
  value: Set<number>;
  onChange: (ids: Set<number>) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Picked projects stay listed even when this panel has nothing for them —
  // otherwise the control would show a filter the user cannot see or clear.
  const options = projects.filter((p) => relevant.has(p.id) || value.has(p.id));
  if (options.length < 2 && value.size === 0) return null;

  function toggle(id: number) {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const label =
    value.size === 0
      ? t("allProjects")
      : value.size === 1
        ? (projects.find((p) => value.has(p.id))?.name ?? t("allProjects"))
        : t("nProjects", { n: String(value.size) });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn flex max-w-48 items-center gap-1.5 px-1.5 py-0.5 text-[12px]"
        aria-label={t("filterByProject")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={value.size > 0 ? { borderColor: "var(--accent)" } : undefined}
      >
        <span className="truncate">{label}</span>
        <span className="text-ink-3">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-72 w-max min-w-full max-w-80 overflow-auto rounded-lg border border-edge bg-surface py-1 shadow-lg">
          {options.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--gridline)]/60"
            >
              <input
                type="checkbox"
                checked={value.has(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  background: `var(--series-${((p.color_slot % 8) + 8) % 8})`,
                }}
                aria-hidden
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
          {value.size > 0 && (
            <button
              type="button"
              className="mt-1 w-full border-t border-edge px-3 py-1.5 text-left text-[13px] text-ink-3 hover:text-ink"
              onClick={() => {
                onChange(new Set());
                setOpen(false);
              }}
            >
              {t("allProjects")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
