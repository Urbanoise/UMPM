"use client";

import { useMemo, useState } from "react";
import type { Project, Task } from "@/lib/types";
import { addDays, fmtShortDate, parseDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

const HORIZON_DAYS = 42;
const COLLAPSED_COUNT = 12;

type Item = {
  key: string;
  kind: "milestone" | "task";
  name: string;
  date: string;
  project: Project;
  overdue: boolean;
  task?: Task;
};

function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

function KindMark({ kind, color }: { kind: Item["kind"]; color: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
      {kind === "milestone" ? (
        <rect
          x={-3.6}
          y={-3.6}
          width={7.2}
          height={7.2}
          rx={1}
          transform="translate(6 6) rotate(45)"
          fill={color}
        />
      ) : (
        <circle cx={6} cy={6} r={4} fill={color} />
      )}
    </svg>
  );
}

export default function Deadlines({
  projects,
  onSelect,
  onEditTask,
}: {
  projects: Project[];
  onSelect: (id: number) => void;
  onEditTask: (task: Task) => void;
}) {
  const { t, locale } = useLang();
  const [expanded, setExpanded] = useState(false);
  const today = todayStr();

  const { overdue, upcoming } = useMemo(() => {
    const horizon = addDays(parseDate(today), HORIZON_DAYS)
      .toISOString()
      .slice(0, 10);
    const items: Item[] = [];
    for (const p of projects) {
      for (const m of p.milestones) {
        if (m.done) continue;
        if (m.due_date <= horizon) {
          items.push({
            key: `m${m.id}`,
            kind: "milestone",
            name: m.name,
            date: m.due_date,
            project: p,
            overdue: m.due_date < today,
          });
        }
      }
      if (p.status === "done") continue;
      for (const task of p.tasks) {
        if (task.status === "done" || !task.end_date) continue;
        if (task.end_date <= horizon) {
          items.push({
            key: `t${task.id}`,
            kind: "task",
            name: task.name,
            date: task.end_date,
            project: p,
            overdue: task.end_date < today,
            task,
          });
        }
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    return {
      overdue: items.filter((i) => i.overdue),
      upcoming: items.filter((i) => !i.overdue),
    };
  }, [projects, today]);

  const all = [...overdue, ...upcoming];
  const shown = expanded ? all : all.slice(0, COLLAPSED_COUNT);
  const hidden = all.length - shown.length;

  function row(item: Item) {
    const color = seriesVar(item.project.color_slot);
    return (
      <li key={item.key}>
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left hover:bg-[var(--gridline)]"
          onClick={() => {
            onSelect(item.project.id);
            if (item.task) onEditTask(item.task);
          }}
          aria-label={`${
            item.kind === "milestone" ? t("typeMilestone") : t("typeTask")
          }: ${item.name}, ${fmtShortDate(item.date, locale)}, ${item.project.name}`}
        >
          <span
            className={`w-14 shrink-0 text-xs tabular-nums ${
              item.overdue
                ? "font-semibold text-[var(--status-critical)]"
                : "text-ink-2"
            }`}
          >
            {item.overdue && "⚠ "}
            {fmtShortDate(item.date, locale)}
          </span>
          <KindMark kind={item.kind} color={color} />
          <span className="min-w-0 flex-1 truncate text-[13px]">
            {item.name}
          </span>
          <span className="max-w-32 shrink-0 truncate text-xs text-ink-3">
            {item.project.name}
          </span>
        </button>
      </li>
    );
  }

  return (
    <section className="card p-4" aria-label={t("deadlinesTitle")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("deadlinesTitle")}</h2>
        <div className="flex items-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <KindMark kind="milestone" color="var(--text-muted)" />
            {t("typeMilestone")}
          </span>
          <span className="flex items-center gap-1.5">
            <KindMark kind="task" color="var(--text-muted)" />
            {t("typeTask")}
          </span>
        </div>
      </div>

      {all.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t("deadlinesEmpty")}</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {shown.map(row)}
          {hidden > 0 && (
            <li>
              <button
                className="px-1 py-1 text-xs font-medium text-[var(--accent)]"
                onClick={() => setExpanded(true)}
              >
                {t("moreItems", { n: String(hidden) })}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
