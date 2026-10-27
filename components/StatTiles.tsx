"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { addDays, parseDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

const COUNT_MS = 700;

// Ids of the panels each tile jumps to; set on those panels' root elements.
export const PANEL_IDS = {
  gantt: "panel-gantt",
  health: "panel-health",
  calendar: "panel-calendar",
  deadlines: "panel-deadlines",
} as const;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Ease the number up from 0 on first paint, and from the old value when it changes.
function useCountUp(target: number) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    const set = (n: number) => {
      shownRef.current = n;
      setShown(n);
    };
    if (prefersReducedMotion()) {
      set(target);
      return;
    }
    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - p) ** 3;
      set(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function jumpTo(ids: string[]) {
  const el = ids.map((id) => document.getElementById(id)).find(Boolean);
  if (!el) return;
  const reduced = prefersReducedMotion();
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  if (reduced) return;
  // restart the highlight if the same tile is clicked twice in a row
  el.classList.remove("panel-flash");
  void el.offsetWidth;
  el.classList.add("panel-flash");
  el.addEventListener("animationend", () => el.classList.remove("panel-flash"), {
    once: true,
  });
}

function Tile({
  label,
  value,
  total,
  alert,
  targets,
}: {
  label: string;
  value: number;
  total?: number; // shown as "value / total" when given
  alert?: boolean;
  targets: string[];
}) {
  const shown = useCountUp(value);
  const shownTotal = useCountUp(total ?? 0);
  const hot = alert && value > 0;
  return (
    <button
      type="button"
      onClick={() => jumpTo(targets)}
      className="stat-tile card group flex-1 cursor-pointer px-4 py-3 text-left"
      style={hot ? { borderColor: "var(--status-critical)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2 text-[13px] text-ink-2">
        <span>{label}</span>
        <span
          className="translate-x-[-4px] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
          aria-hidden
        >
          →
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tabular-nums">
        <span>
          {shown}
          {total !== undefined && (
            <span className="text-lg font-normal text-ink-3"> / {shownTotal}</span>
          )}
        </span>
        {hot && (
          <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden"
              style={{ background: "var(--status-critical)" }}
            />
            <span
              className="relative inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--status-critical)" }}
            />
          </span>
        )}
      </div>
    </button>
  );
}

export default function StatTiles({ projects }: { projects: Project[] }) {
  const { t } = useLang();
  const today = todayStr();
  const in30 = addDays(parseDate(today), 30).toISOString().slice(0, 10);

  const active = projects.filter((p) => p.status === "active").length;
  // "Ongoing" is everything not finished — the same rows the timeline shows
  // while past projects are hidden.
  const ongoing = projects.filter((p) => p.status !== "done").length;
  const upcomingMilestones = projects
    .flatMap((p) => p.milestones)
    .filter((m) => !m.done && m.due_date >= today && m.due_date <= in30).length;
  const overdue =
    projects
      .flatMap((p) => p.milestones)
      .filter((m) => !m.done && m.due_date < today).length +
    projects
      .filter((p) => p.status !== "done")
      .flatMap((p) => p.tasks)
      .filter((task) => task.status !== "done" && task.end_date && task.end_date < today)
      .length;

  // Each tile lists a fallback, since some panels render nothing when empty.
  return (
    <div className="flex flex-wrap gap-3">
      <Tile
        label={t("statProjectsOngoing")}
        value={ongoing}
        total={projects.length}
        targets={[PANEL_IDS.gantt]}
      />
      <Tile
        label={t("statActive")}
        value={active}
        targets={[PANEL_IDS.health, PANEL_IDS.gantt]}
      />
      <Tile
        label={t("statMilestones30")}
        value={upcomingMilestones}
        targets={[PANEL_IDS.calendar, PANEL_IDS.deadlines]}
      />
      <Tile
        label={t("statOverdue")}
        value={overdue}
        alert
        targets={[PANEL_IDS.deadlines, PANEL_IDS.calendar]}
      />
    </div>
  );
}
