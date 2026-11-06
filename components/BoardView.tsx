"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Task, TaskCategory, TaskStatus } from "@/lib/types";
import { fmtShortDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";
import { linkedTaskIds } from "@/lib/linked";
import { statusColor, statusLabel, statusOrder } from "@/lib/taskStatus";
import { seriesVar } from "@/lib/workItems";
import { KindMark } from "./Deadlines";
import TaskNote from "./TaskNote";

type Card = { task: Task; project: Project; linked: boolean };

// Soonest deadline first; the finished column reads most-recent-first instead.
// Undated tasks go last either way.
function compareCards(status: TaskStatus) {
  const sign = status === "done" ? -1 : 1;
  return (a: Card, b: Card) => {
    const ad = a.task.end_date;
    const bd = b.task.end_date;
    if (!ad || !bd) return ad ? -1 : bd ? 1 : 0;
    return sign * ad.localeCompare(bd);
  };
}

export default function BoardView({
  projects,
  categories,
  onMoveTask,
  onSelect,
  onEditTask,
}: {
  projects: Project[];
  categories: TaskCategory[];
  onMoveTask: (task: Task, status: TaskStatus) => void;
  onSelect: (id: number) => void;
  onEditTask: (task: Task) => void;
}) {
  const { t, locale } = useLang();
  const today = todayStr();
  const [dragging, setDragging] = useState<Task | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  // A card changes column by remounting, which would drop keyboard focus.
  const refocusId = useRef<number | null>(null);

  const statuses = useMemo(() => statusOrder(categories), [categories]);

  const columns = useMemo(() => {
    const cards: Card[] = projects.flatMap((p) => {
      const linked = linkedTaskIds(p);
      return p.tasks.map((task) => ({
        task,
        project: p,
        linked: linked.has(task.id),
      }));
    });
    return statuses.map((status) => ({
      status,
      cards: cards
        .filter((c) => c.task.status === status)
        .sort(compareCards(status)),
    }));
  }, [projects, statuses]);

  useEffect(() => {
    if (refocusId.current === null) return;
    document
      .querySelector<HTMLElement>(`[data-board-task="${refocusId.current}"]`)
      ?.focus();
    refocusId.current = null;
  }, [columns]);

  function move(task: Task, status: TaskStatus) {
    if (task.status !== status) onMoveTask(task, status);
  }

  return (
    <div className="grid gap-3 pb-1 sm:auto-cols-[minmax(13rem,1fr)] sm:grid-flow-col sm:overflow-x-auto">
        {columns.map(({ status, cards }) => {
          const canDrop = dragging !== null && dragging.status !== status;
          return (
            <section
              key={status}
              aria-label={statusLabel(status, categories, t)}
              className="flex min-h-40 flex-col rounded-lg bg-[var(--gridline)]/35 p-2"
              style={
                canDrop && overColumn === status
                  ? { boxShadow: "inset 0 0 0 2px var(--accent)" }
                  : undefined
              }
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverColumn(status);
              }}
              onDragLeave={(e) => {
                // Moving onto a card inside the column also fires dragleave.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOverColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, status);
                setDragging(null);
                setOverColumn(null);
              }}
            >
              <h3 className="flex items-center gap-2 px-1 pb-2 text-[16px] font-semibold">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: statusColor(status) }}
                  aria-hidden
                />
                {statusLabel(status, categories, t)}
                <span className="font-normal tabular-nums text-ink-3">
                  {cards.length}
                </span>
              </h3>

              {cards.length === 0 ? (
                <p className="px-1 py-6 text-center text-[16px] text-ink-3">
                  {t("boardColumnEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {cards.map(({ task, project, linked }) => {
                    const overdue =
                      status !== "done" &&
                      !!task.end_date &&
                      task.end_date < today;
                    const index = statuses.indexOf(status);
                    const targets = [
                      { to: statuses[index - 1], glyph: "‹" },
                      { to: statuses[index + 1], glyph: "›" },
                    ];
                    return (
                      <li
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          // Firefox will not start a drag without data set.
                          e.dataTransfer.setData("text/plain", task.name);
                          setDragging(task);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOverColumn(null);
                        }}
                        className="group card cursor-grab px-2.5 py-2 active:cursor-grabbing"
                        style={{
                          borderLeft: `3px solid ${seriesVar(project.color_slot)}`,
                          opacity: dragging?.id === task.id ? 0.5 : 1,
                        }}
                      >
                        <button
                          type="button"
                          data-board-task={task.id}
                          className={`block w-full cursor-pointer text-left text-[16px] hover:underline ${
                            status === "done" ? "text-ink-3 line-through" : ""
                          }`}
                          onClick={() => onEditTask(task)}
                        >
                          {task.name}
                        </button>
                        <TaskNote note={task.note} />
                        <button
                          type="button"
                          className="mt-1 block max-w-full cursor-pointer truncate text-left text-[15px] text-ink-3 hover:text-ink hover:underline"
                          onClick={() => onSelect(project.id)}
                        >
                          {project.name}
                        </button>
                        <div className="mt-1 flex min-h-6 items-center gap-2 text-[15px] text-ink-2">
                          {linked && (
                            <span title={t("typeMilestone")} className="flex">
                              <KindMark
                                kind="milestone"
                                color="var(--cal-milestone)"
                              />
                            </span>
                          )}
                          <span className="min-w-0 truncate">
                            {task.assignee ?? t("unassigned")}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {task.end_date && (
                              <span
                                className={
                                  overdue
                                    ? "font-medium text-[var(--status-critical)]"
                                    : "text-ink-3"
                                }
                              >
                                {fmtShortDate(task.end_date, locale)}
                              </span>
                            )}
                            {/* Dragging has no keyboard or touch equivalent. */}
                            {targets.map(
                              ({ to, glyph }) =>
                                to && (
                                  <button
                                    key={to}
                                    type="button"
                                    className="cursor-pointer rounded px-1.5 text-[17px] leading-5 text-ink-3 opacity-0 hover:bg-[var(--gridline)] hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                                    aria-label={t("moveToStatus", {
                                      status: statusLabel(to, categories, t),
                                      name: task.name,
                                    })}
                                    title={statusLabel(to, categories, t)}
                                    onClick={() => {
                                      refocusId.current = task.id;
                                      move(task, to);
                                    }}
                                  >
                                    {glyph}
                                  </button>
                                )
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
    </div>
  );
}
