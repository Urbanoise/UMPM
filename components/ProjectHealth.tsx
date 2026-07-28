"use client";

import { ReactNode, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { fmtDate, parseDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

const DAY = 86_400_000;
// tasks-done % lagging time-elapsed % by more than this reads as slipping
const BEHIND_GAP = 0.25;

function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

type Row = {
  project: Project;
  elapsed: number; // 0..1
  done: number | null; // 0..1, null when no tasks
  tasksDone: number;
  tasksTotal: number;
  msDone: number;
  msTotal: number;
  daysLeft: number; // negative = past end date
  behind: boolean;
};

type Tip = { x: number; y: number; body: ReactNode };

const STATUS_ORDER: Record<Project["status"], number> = {
  active: 0,
  "on-hold": 1,
  planned: 2,
  done: 3,
};

export default function ProjectHealth({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (id: number) => void;
}) {
  const { t, locale } = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const today = todayStr();
  const todayMs = parseDate(today).getTime();

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const p of projects) {
      if (p.status === "done") continue;
      const start = parseDate(p.start_date).getTime();
      const end = Math.max(parseDate(p.end_date).getTime(), start + DAY / 2);
      const elapsed = Math.min(Math.max((todayMs - start) / (end - start), 0), 1);
      const tasksTotal = p.tasks.length;
      const tasksDone = p.tasks.filter((x) => x.status === "done").length;
      const done = tasksTotal ? tasksDone / tasksTotal : null;
      const msTotal = p.milestones.length;
      const msDone = p.milestones.filter((m) => m.done).length;
      out.push({
        project: p,
        elapsed,
        done,
        tasksDone,
        tasksTotal,
        msDone,
        msTotal,
        daysLeft: Math.round((end - todayMs) / DAY),
        behind:
          p.status === "active" &&
          done !== null &&
          elapsed - done > BEHIND_GAP,
      });
    }
    out.sort(
      (a, b) =>
        STATUS_ORDER[a.project.status] - STATUS_ORDER[b.project.status] ||
        a.project.end_date.localeCompare(b.project.end_date)
    );
    return out;
  }, [projects, todayMs]);

  function showTip(evt: React.PointerEvent | React.FocusEvent, row: Row) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    let cx: number;
    let cy: number;
    if ("clientX" in evt) {
      cx = evt.clientX - rect.left;
      cy = evt.clientY - rect.top;
    } else {
      const r = (evt.target as Element).getBoundingClientRect();
      cx = r.left + r.width / 2 - rect.left;
      cy = r.top - rect.top;
    }
    const p = row.project;
    setTip({
      x: Math.min(Math.max(cx, 120), rect.width - 120),
      y: cy,
      body: (
        <div>
          <div className="text-[13px] font-semibold">{p.name}</div>
          <div className="mt-1 space-y-0.5 text-ink-2">
            <div>{t(`status_${p.status}`)}</div>
            <div>
              {t("taskProgress")}:{" "}
              <span className="font-medium text-ink">
                {row.tasksTotal ? `${row.tasksDone}/${row.tasksTotal}` : "—"}
              </span>
            </div>
            {row.msTotal > 0 && (
              <div>
                {t("milestones")}:{" "}
                <span className="font-medium text-ink">
                  {row.msDone}/{row.msTotal}
                </span>
              </div>
            )}
            <div>
              {t("timeElapsed")}:{" "}
              <span className="font-medium text-ink">
                {Math.round(row.elapsed * 100)}%
              </span>
            </div>
            <div>
              {row.daysLeft >= 0
                ? t("daysLeft", { n: String(row.daysLeft) })
                : t("daysOver", { n: String(-row.daysLeft) })}{" "}
              ({fmtDate(p.end_date, locale)})
            </div>
          </div>
        </div>
      ),
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="card p-4" aria-label={t("healthTitle")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("healthTitle")}</h2>
        <div className="flex items-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="flex h-2.5 w-5 overflow-hidden rounded-sm" aria-hidden>
              <span
                className="h-full w-1/2"
                style={{ background: "var(--text-muted)" }}
              />
              <span
                className="h-full w-1/2"
                style={{ background: "var(--text-muted)", opacity: 0.25 }}
              />
            </span>
            {t("legendTasksDone")}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-0.5"
              style={{ background: "var(--text-primary)" }}
              aria-hidden
            />
            {t("timeElapsed")}
          </span>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-3 space-y-1">
        {rows.map((row) => {
          const p = row.project;
          const color = seriesVar(p.color_slot);
          return (
            <div
              key={p.id}
              className="flex cursor-pointer items-center gap-3 rounded-md py-1"
              tabIndex={0}
              role="button"
              aria-label={`${p.name}: ${
                row.tasksTotal
                  ? `${row.tasksDone}/${row.tasksTotal} ${t("tasksDoneSuffix")}`
                  : t("noTasks")
              }, ${t("timeElapsed")} ${Math.round(row.elapsed * 100)}%`}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(p.id)}
              onPointerMove={(e) => showTip(e, row)}
              onPointerLeave={() => setTip(null)}
              onFocus={(e) => showTip(e, row)}
              onBlur={() => setTip(null)}
            >
              <div className="flex w-40 shrink-0 items-center gap-1.5">
                <span className="truncate text-[13px]">{p.name}</span>
                {row.behind && (
                  <span
                    className="shrink-0 rounded px-1 py-px text-[10px] font-semibold text-white"
                    style={{ background: "var(--status-critical)" }}
                  >
                    {t("behindBadge")}
                  </span>
                )}
              </div>
              <div className="relative h-4 flex-1">
                {/* track */}
                <div
                  className="absolute inset-0 rounded-[4px]"
                  style={{ background: color, opacity: 0.18 }}
                />
                {/* tasks-done fill */}
                {row.done !== null && row.done > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-l-[4px] rounded-r-[4px]"
                    style={{
                      background: color,
                      width: `${row.done * 100}%`,
                    }}
                  />
                )}
                {/* time-elapsed tick */}
                <div
                  className="absolute -inset-y-0.5 w-[2px]"
                  style={{
                    left: `calc(${row.elapsed * 100}% - 1px)`,
                    background: "var(--text-primary)",
                  }}
                />
              </div>
              <div className="w-10 shrink-0 text-right text-[13px] font-medium tabular-nums">
                {row.done !== null ? `${Math.round(row.done * 100)}%` : "—"}
              </div>
            </div>
          );
        })}

        {tip && (
          <div
            className="pointer-events-none absolute z-10 max-w-60 rounded-lg border border-edge bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: tip.x,
              top: tip.y - 12,
              transform: "translate(-50%, -100%)",
            }}
          >
            {tip.body}
          </div>
        )}
      </div>

      {/* WCAG table twin */}
      <table className="sr-only">
        <caption>{t("healthTitle")}</caption>
        <thead>
          <tr>
            <th>{t("fieldName")}</th>
            <th>{t("legendTasksDone")}</th>
            <th>{t("timeElapsed")}</th>
            <th>{t("fieldEnd")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.project.id}>
              <td>{row.project.name}</td>
              <td>
                {row.tasksTotal
                  ? `${row.tasksDone}/${row.tasksTotal}`
                  : "—"}
              </td>
              <td>{Math.round(row.elapsed * 100)}%</td>
              <td>{fmtDate(row.project.end_date, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
