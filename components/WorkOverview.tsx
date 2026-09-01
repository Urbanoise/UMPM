"use client";

import { ReactNode, useMemo, useRef, useState } from "react";
import type { Project, Task } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";
import { fmtShortDate, todayStr } from "@/lib/dates";
import { useLang, type StrKey } from "@/lib/i18n";
import { splitAssignees } from "@/lib/assignees";
import ProjectFilter from "./ProjectFilter";

// Task segments encode urgency rather than the raw status column: anything
// past its end_date reads as overdue whatever the status says. Gray = not
// started, green = underway, charcoal = finished — the same semantic scheme
// the project row uses, so the two overview bars read as one system (status
// encoding, not identity — CVD-separable and 3:1 on both surfaces).
const SEGMENTS = [
  { key: "overdue", color: "var(--status-critical)", labelKey: "overdueWord" },
  {
    key: "inProgress",
    color: "var(--status-good)",
    labelKey: "tstatus_in-progress",
  },
  { key: "todo", color: "var(--text-muted)", labelKey: "tstatus_todo" },
  { key: "done", color: "var(--series-3)", labelKey: "tstatus_done" },
] as const satisfies readonly { key: string; color: string; labelKey: StrKey }[];

const PROJECT_COLORS: Record<Project["status"], string> = {
  planned: "var(--text-muted)",
  active: "var(--status-good)",
  "on-hold": "var(--status-serious)",
  done: "var(--series-3)",
};

type SegKey = (typeof SEGMENTS)[number]["key"];
type Counts = Record<SegKey, number>;
type GroupBy = "person" | "project";

// most urgent first — also the stacking order inside every bar
const SEG_ORDER = Object.fromEntries(
  SEGMENTS.map((s, i) => [s.key, i])
) as Record<SegKey, number>;

type Seg = { key: string; labelKey: StrKey; color: string; count: number };
type Entry = { task: Task; project: Project; seg: SegKey };
type Row = {
  key: string;
  label: string;
  muted?: boolean;
  dotColor?: string;
  counts: Counts;
  total: number;
  entries: Entry[];
};
type Tip = { x: number; y: number; body: ReactNode };

function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

function segOf(task: Task, today: string): SegKey {
  if (task.status === "done") return "done";
  if (task.end_date && task.end_date < today) return "overdue";
  if (task.status === "in-progress") return "inProgress";
  return "todo";
}

function segColor(seg: SegKey) {
  return SEGMENTS.find((s) => s.key === seg)!.color;
}

function segLabelKey(seg: SegKey) {
  return SEGMENTS.find((s) => s.key === seg)!.labelKey;
}

function emptyCounts(): Counts {
  return { overdue: 0, inProgress: 0, todo: 0, done: 0 };
}

export default function WorkOverview({
  projects,
  filterId,
  onFilter,
  onSelect,
  onEditTask,
}: {
  projects: Project[];
  filterId: number | null;
  onFilter: (id: number | null) => void;
  onSelect: (id: number) => void;
  onEditTask: (task: Task) => void;
}) {
  const { t, locale } = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("person");
  const [showDone, setShowDone] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const today = todayStr();

  // The dropdown offers whatever the show-completed switch lets through; the
  // project filter itself narrows only what the bars below count.
  const relevant = useMemo(
    () =>
      new Set(
        projects.filter((p) => showDone || p.status !== "done").map((p) => p.id)
      ),
    [projects, showDone]
  );

  const { projectSegs, taskSegs, projectTotal, taskTotal, rows } = useMemo(() => {
    // One switch drives the whole panel: with completed work hidden this is
    // open work only (finished projects drop out with their tasks); with it
    // shown it is every project and every task.
    const pool = showDone
      ? projects
      : projects.filter((p) => p.status !== "done");
    const visible =
      filterId === null ? pool : pool.filter((p) => p.id === filterId);

    const entries: Entry[] = [];
    for (const p of visible) {
      for (const task of p.tasks) {
        if (!showDone && task.status === "done") continue;
        entries.push({ task, project: p, seg: segOf(task, today) });
      }
    }

    const projectSegs: Seg[] = PROJECT_STATUSES.map((s) => ({
      key: s,
      labelKey: `status_${s}` as StrKey,
      color: PROJECT_COLORS[s],
      count: visible.filter((p) => p.status === s).length,
    }));
    // The overview counts every task once; the group rows below can count a
    // task twice when it carries two assignees.
    const taskSegs: Seg[] = SEGMENTS.map((s) => ({
      key: s.key,
      labelKey: s.labelKey,
      color: s.color,
      count: entries.filter((e) => e.seg === s.key).length,
    }));

    type Bucket = Omit<Row, "counts" | "total">;
    const buckets = new Map<string, Bucket>();
    function bucket(key: string, init: () => Omit<Bucket, "key" | "entries">) {
      const found = buckets.get(key);
      if (found) return found;
      const made: Bucket = { key, entries: [], ...init() };
      buckets.set(key, made);
      return made;
    }
    for (const e of entries) {
      if (groupBy === "person") {
        const names = splitAssignees(e.task.assignee);
        const persons: (string | null)[] = names.length ? names : [null];
        for (const person of persons) {
          bucket(person ?? " unassigned", () => ({
            label: person ?? "",
            muted: person === null,
          })).entries.push(e);
        }
      } else {
        bucket(String(e.project.id), () => ({
          label: e.project.name,
          dotColor: seriesVar(e.project.color_slot),
        })).entries.push(e);
      }
    }

    const rows: Row[] = [...buckets.values()].map((b) => {
      const counts = emptyCounts();
      for (const e of b.entries) counts[e.seg]++;
      // most urgent first, then by due date (undated last), then by name
      b.entries.sort(
        (x, y) =>
          SEG_ORDER[x.seg] - SEG_ORDER[y.seg] ||
          (x.task.end_date ?? "9999").localeCompare(y.task.end_date ?? "9999") ||
          x.task.name.localeCompare(y.task.name)
      );
      return { ...b, counts, total: b.entries.length };
    });
    // longest bar first, so the bars read as a descending staircase
    rows.sort((a, b) => {
      if (!!a.muted !== !!b.muted) return a.muted ? 1 : -1;
      return b.total - a.total || a.label.localeCompare(b.label);
    });

    return {
      projectSegs,
      taskSegs,
      projectTotal: visible.length,
      taskTotal: entries.length,
      rows,
    };
  }, [projects, today, showDone, groupBy, filterId]);

  const max = Math.max(1, ...rows.map((r) => r.total));

  function onHover(
    e: React.PointerEvent,
    label: string,
    count: number,
    total: number
  ) {
    const wrap = wrapRef.current;
    if (!wrap || total === 0) return;
    const rect = wrap.getBoundingClientRect();
    setTip({
      x: Math.min(Math.max(e.clientX - rect.left, 80), rect.width - 80),
      y: e.clientY - rect.top,
      body: (
        <div>
          <span className="font-semibold">{label}</span>{" "}
          <span className="text-ink-2">
            {count} · {Math.round((count / total) * 100)}%
          </span>
        </div>
      ),
    });
  }

  function bar(segs: Seg[], width: string, total: number) {
    const visible = segs.filter((s) => s.count > 0);
    return (
      <span className="flex h-4 min-w-0 flex-1 items-center">
        <span className="flex h-4 gap-[2px]" style={{ width }}>
          {visible.map((s, i) => (
            <span
              key={s.key}
              className={`${i === 0 ? "rounded-l-[4px]" : ""} ${
                i === visible.length - 1 ? "rounded-r-[4px]" : ""
              }`}
              style={{
                background: s.color,
                flexGrow: s.count,
                flexBasis: 0,
                minWidth: 4,
              }}
              onPointerMove={(e) => onHover(e, t(s.labelKey), s.count, total)}
              onPointerLeave={() => setTip(null)}
            />
          ))}
        </span>
      </span>
    );
  }

  function legend(segs: Seg[]) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-27 text-xs text-ink-2">
        {segs.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color, opacity: s.count ? 1 : 0.35 }}
              aria-hidden
            />
            {t(s.labelKey)}{" "}
            <span className="font-medium text-ink tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>
    );
  }

  function overviewRow(label: string, segs: Seg[], total: number) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <div className="w-24 shrink-0 text-[13px]">{label}</div>
          {total === 0 ? (
            <div className="flex-1 text-xs text-ink-3">—</div>
          ) : (
            bar(segs, "100%", total)
          )}
          <div className="w-6 shrink-0 text-right text-[13px] font-medium tabular-nums">
            {total}
          </div>
        </div>
        {legend(segs)}
      </div>
    );
  }

  function rowSegs(row: Row): Seg[] {
    return SEGMENTS.map((s) => ({
      key: s.key,
      labelKey: s.labelKey,
      color: s.color,
      count: row.counts[s.key],
    }));
  }

  function countsLabel(row: Row) {
    return SEGMENTS.filter((s) => row.counts[s.key] > 0)
      .map((s) => `${t(s.labelKey)}: ${row.counts[s.key]}`)
      .join(", ");
  }

  return (
    <section className="card p-4" aria-label={t("overviewTitle")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold">{t("overviewTitle")}</h2>
          <ProjectFilter
            projects={projects}
            relevant={relevant}
            value={filterId}
            onChange={onFilter}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="px-1.5 py-0.5 text-[12px]"
            value={groupBy}
            aria-label={t("groupBy")}
            onChange={(e) => {
              setGroupBy(e.target.value as GroupBy);
              setOpenKey(null);
            }}
          >
            <option value="person">{t("byAssignee")}</option>
            <option value="project">{t("byProject")}</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--accent)]"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            {t("showCompleted")}
          </label>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-4 space-y-4">
        {overviewRow(t("statProjects"), projectSegs, projectTotal)}
        {overviewRow(t("tasks"), taskSegs, taskTotal)}

        <hr className="border-edge" />

        {rows.length === 0 ? (
          <p className="text-sm text-ink-3">{t("overviewEmpty")}</p>
        ) : (
          <div>
            <ul>
              {rows.map((row) => {
                const open = openKey === row.key;
                return (
                  <li key={row.key}>
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-[var(--gridline)]"
                      aria-expanded={open}
                      aria-controls={`wo-${row.key}`}
                      aria-label={`${
                        row.muted ? t("unassigned") : row.label
                      } — ${countsLabel(row)}`}
                      onClick={() => setOpenKey(open ? null : row.key)}
                    >
                      <svg
                        width={10}
                        height={10}
                        viewBox="0 0 10 10"
                        className="shrink-0 text-ink-3"
                        style={{
                          transform: open ? "rotate(90deg)" : undefined,
                          transition: "transform 120ms",
                        }}
                        aria-hidden
                      >
                        <path d="M3 1.5 L7 5 L3 8.5 Z" fill="currentColor" />
                      </svg>
                      <span className="flex w-28 shrink-0 items-center gap-1.5">
                        {row.dotColor && (
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: row.dotColor }}
                            aria-hidden
                          />
                        )}
                        <span
                          className={`truncate text-[13px] ${
                            row.muted ? "italic text-ink-3" : ""
                          }`}
                          title={row.muted ? t("unassigned") : row.label}
                        >
                          {row.muted ? t("unassigned") : row.label}
                        </span>
                      </span>
                      {bar(
                        rowSegs(row),
                        `${(row.total / max) * 100}%`,
                        row.total
                      )}
                      <span className="w-9 shrink-0 text-right text-xs tabular-nums">
                        {row.counts.overdue > 0 ? (
                          <span className="font-semibold text-[var(--status-critical)]">
                            ⚠ {row.counts.overdue}
                          </span>
                        ) : null}
                      </span>
                      <span className="w-6 shrink-0 text-right text-[13px] font-medium tabular-nums">
                        {row.total}
                      </span>
                    </button>

                    {open && (
                      <ul
                        id={`wo-${row.key}`}
                        className="mb-1 ml-3 space-y-0.5 border-l border-edge pl-3"
                      >
                        {row.entries.map(({ task, project, seg }) => (
                          <li key={task.id}>
                            <button
                              className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-[var(--gridline)]"
                              onClick={() => {
                                onSelect(project.id);
                                onEditTask(task);
                              }}
                              aria-label={`${task.name}, ${t(
                                segLabelKey(seg)
                              )}, ${
                                task.end_date
                                  ? fmtShortDate(task.end_date, locale)
                                  : t("noDate")
                              }, ${project.name}`}
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: segColor(seg) }}
                                aria-hidden
                              />
                              <span
                                className={`min-w-0 flex-1 truncate text-[13px] ${
                                  seg === "done" ? "text-ink-3 line-through" : ""
                                }`}
                              >
                                {task.name}
                              </span>
                              <span className="max-w-28 shrink-0 truncate text-xs text-ink-3">
                                {groupBy === "project"
                                  ? task.assignee ?? t("unassigned")
                                  : project.name}
                              </span>
                              <span
                                className={`w-16 shrink-0 whitespace-nowrap text-right text-xs tabular-nums ${
                                  seg === "overdue"
                                    ? "font-semibold text-[var(--status-critical)]"
                                    : "text-ink-2"
                                }`}
                              >
                                {task.end_date
                                  ? `${
                                      seg === "overdue" ? "⚠ " : ""
                                    }${fmtShortDate(task.end_date, locale)}`
                                  : "—"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 px-1 text-xs text-ink-3">{t("overviewHint")}</p>
          </div>
        )}

        {tip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-edge bg-surface px-3 py-2 text-xs shadow-lg"
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
      {rows.length > 0 && (
        <table className="sr-only">
          <caption>{t("overviewTitle")}</caption>
          <thead>
            <tr>
              <th>{groupBy === "person" ? t("assignee") : t("statProjects")}</th>
              {SEGMENTS.map((s) => (
                <th key={s.key}>{t(s.labelKey)}</th>
              ))}
              <th>{t("tasks")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.muted ? t("unassigned") : row.label}</td>
                {SEGMENTS.map((s) => (
                  <td key={s.key}>{row.counts[s.key]}</td>
                ))}
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
