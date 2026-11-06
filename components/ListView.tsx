"use client";

import { useMemo, useState } from "react";
import type {
  Milestone,
  Project,
  Task,
  TaskCategory,
  TaskStatus,
} from "@/lib/types";
import { linkedTaskIds } from "@/lib/linked";
import { fmtDate, todayStr } from "@/lib/dates";
import { useCanEdit } from "@/lib/access";
import { useLang, type StrKey } from "@/lib/i18n";
import { statusColor, statusLabel, statusOrder } from "@/lib/taskStatus";
import { seriesVar } from "@/lib/workItems";
import { KindMark } from "./Deadlines";
import TaskNote from "./TaskNote";

type SortKey = "name" | "project" | "assignee" | "start" | "end";

const COLUMNS: { key: SortKey; label: StrKey }[] = [
  { key: "name", label: "colName" },
  { key: "project", label: "colProject" },
  { key: "assignee", label: "assignee" },
  { key: "start", label: "colStart" },
  { key: "end", label: "colEnd" },
];

type Row = {
  key: string;
  name: string;
  project: Project;
  assignee: string | null;
  start: string | null;
  end: string | null;
  status: TaskStatus;
  isDeliverable: boolean; // a deliverable, or a task linked to one
  task?: Task;
  milestone?: Milestone;
};

function sortValue(row: Row, key: SortKey): string | null {
  return key === "project" ? row.project.name : row[key];
}

// A deliverable with no task is only ever open or done.
function allowedStatuses(row: Row, statuses: TaskStatus[]): TaskStatus[] {
  return statuses.filter((s) => row.task || s === "todo" || s === "done");
}

export default function ListView({
  projects,
  categories,
  onMoveTask,
  onSetDeliverableDone,
  onSelect,
  onEditTask,
}: {
  projects: Project[];
  categories: TaskCategory[];
  onMoveTask: (task: Task, status: TaskStatus) => void;
  onSetDeliverableDone: (m: Milestone, done: boolean) => void;
  onSelect: (id: number) => void;
  onEditTask: (task: Task) => void;
}) {
  const { t, locale } = useLang();
  const canEdit = useCanEdit();
  const today = todayStr();
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "end",
    asc: true,
  });
  const [showDone, setShowDone] = useState(true);
  const [dragging, setDragging] = useState<Row | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);

  // A linked task and deliverable are one commitment, so they share one row.
  // Unlike the calendar it is the task's row: only the task has an assignee, a
  // start date and the in-progress status this table shows.
  const rows = useMemo(() => {
    const rows: Row[] = [];
    for (const p of projects) {
      const linked = linkedTaskIds(p);
      for (const task of p.tasks) {
        rows.push({
          key: `t${task.id}`,
          name: task.name,
          project: p,
          assignee: task.assignee,
          start: task.start_date,
          end: task.end_date,
          status: task.status,
          isDeliverable: linked.has(task.id),
          task,
        });
      }
      for (const m of p.milestones) {
        if (m.task_id !== null) continue;
        rows.push({
          key: `m${m.id}`,
          name: m.name,
          project: p,
          assignee: null,
          start: null,
          end: m.due_date,
          status: m.done ? "done" : "todo",
          isDeliverable: true,
          milestone: m,
        });
      }
    }
    return rows;
  }, [projects]);

  const statuses = useMemo(() => statusOrder(categories), [categories]);

  // One group per status; the chosen sort applies inside each. An empty group
  // stays on screen so there is somewhere to drag a row to.
  const groups = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Blanks stay at the bottom in both directions.
      if (av === null || bv === null)
        return av !== null ? -1 : bv !== null ? 1 : 0;
      const cmp = av.localeCompare(bv, locale);
      return sort.asc ? cmp : -cmp;
    });
    return statuses.filter((s) => showDone || s !== "done").map(
      (status) => ({
        status,
        rows: sorted.filter((r) => r.status === status),
      })
    );
  }, [rows, statuses, showDone, sort, locale]);

  function toggleSort(key: SortKey) {
    setSort((cur) =>
      cur.key === key ? { key, asc: !cur.asc } : { key, asc: true }
    );
  }

  function setStatus(row: Row, status: TaskStatus) {
    if (row.task) onMoveTask(row.task, status);
    else onSetDeliverableDone(row.milestone!, status === "done");
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[16px] text-ink-2">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          {t("showCompleted")}
        </label>
      </div>

      {groups.every((g) => g.rows.length === 0) ? (
        <p className="py-6 text-center text-sm text-ink-3">
          {t("overviewEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[16px]">
            <thead>
              <tr className="border-b border-edge text-left text-ink-3">
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className="px-2 py-1.5 font-medium whitespace-nowrap"
                    aria-sort={
                      sort.key !== c.key
                        ? "none"
                        : sort.asc
                          ? "ascending"
                          : "descending"
                    }
                  >
                    <button
                      type="button"
                      className="cursor-pointer hover:text-ink"
                      onClick={() => toggleSort(c.key)}
                    >
                      {t(c.label)}
                      <span className="ml-1 inline-block w-2" aria-hidden>
                        {sort.key === c.key ? (sort.asc ? "↑" : "↓") : ""}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("fieldStatus")}
                </th>
              </tr>
            </thead>
            {groups.map(({ status, rows: groupRows }) => {
              const canDrop =
                dragging !== null &&
                dragging.status !== status &&
                allowedStatuses(dragging, statuses).includes(status);
              return (
                <tbody
                  key={status}
                  data-list-group={status}
                  style={
                    canDrop && overStatus === status
                      ? {
                          background:
                            "color-mix(in srgb, var(--accent) 12%, transparent)",
                        }
                      : undefined
                  }
                  onDragOver={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverStatus(status);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                      setOverStatus(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging && canDrop) setStatus(dragging, status);
                    setDragging(null);
                    setOverStatus(null);
                  }}
                >
                  <tr className="border-b border-edge">
                    <th
                      colSpan={COLUMNS.length + 1}
                      scope="rowgroup"
                      className="bg-[var(--gridline)]/35 px-2 py-1.5 text-left font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: statusColor(status) }}
                          aria-hidden
                        />
                        {statusLabel(status, categories, t)}
                        <span className="font-normal tabular-nums text-ink-3">
                          {groupRows.length}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {groupRows.length === 0 && (
                    <tr className="border-b border-edge">
                      <td
                        colSpan={COLUMNS.length + 1}
                        className="px-2 py-3 text-center text-ink-3"
                      >
                        {t("boardColumnEmpty")}
                      </td>
                    </tr>
                  )}
              {groupRows.map((row) => {
                const done = row.status === "done";
                const overdue = !done && !!row.end && row.end < today;
                return (
                  <tr
                    key={row.key}
                    draggable={canEdit}
                    data-list-row={row.key}
                    className={`border-b border-edge hover:bg-[var(--gridline)]/40 ${
                      canEdit ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                    style={{ opacity: dragging?.key === row.key ? 0.5 : 1 }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", row.name);
                      setDragging(row);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOverStatus(null);
                    }}
                  >
                    <td className="px-2 py-1.5">
                      <span className="flex items-start gap-1.5">
                        <span
                          className="mt-0.5 shrink-0"
                          title={t(
                            row.isDeliverable ? "typeMilestone" : "typeTask"
                          )}
                        >
                          <KindMark
                            kind={row.isDeliverable ? "milestone" : "task"}
                            color={
                              row.isDeliverable
                                ? "var(--cal-milestone)"
                                : "var(--cal-task)"
                            }
                          />
                        </span>
                        <span className="min-w-0">
                          <button
                            type="button"
                            className={`cursor-pointer text-left hover:underline ${
                              done ? "text-ink-3 line-through" : ""
                            }`}
                            onClick={() =>
                              row.task
                                ? onEditTask(row.task)
                                : onSelect(row.project.id)
                            }
                          >
                            {row.name}
                          </button>
                          <TaskNote note={row.task?.note ?? null} />
                        </span>
                      </span>
                    </td>
                    <td className="max-w-48 px-2 py-1.5">
                      <button
                        type="button"
                        className="flex max-w-full cursor-pointer items-center gap-1.5 text-left text-ink-2 hover:underline"
                        onClick={() => onSelect(row.project.id)}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{
                            background: seriesVar(row.project.color_slot),
                          }}
                          aria-hidden
                        />
                        <span className="truncate">{row.project.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-ink-2">
                      {row.assignee ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                      {fmtDate(row.start, locale)}
                    </td>
                    <td
                      className={`px-2 py-1.5 whitespace-nowrap ${
                        overdue
                          ? "font-medium text-[var(--status-critical)]"
                          : "text-ink-2"
                      }`}
                    >
                      {fmtDate(row.end, locale)}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="px-1.5 py-0.5 text-[15px]"
                        value={row.status}
                        disabled={!canEdit}
                        aria-label={`${t("statusOf")} ${row.name}`}
                        onChange={(e) =>
                          setStatus(row, e.target.value as TaskStatus)
                        }
                      >
                        {allowedStatuses(row, statuses).map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s, categories, t)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
