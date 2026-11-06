"use client";

import { useMemo, useState } from "react";
import type { Milestone, Project, Task } from "@/lib/types";
import {
  daysBetween,
  fmtDate,
  fmtMonthYear,
  monthCells,
  shiftDate,
  todayStr,
  weekdayInitials,
  ymd,
} from "@/lib/dates";
import { useCanEdit } from "@/lib/access";
import { useLang } from "@/lib/i18n";
import {
  calendarSpans,
  seriesVar,
  weekSegments,
  type CalendarSpan,
  type WeekSegment,
} from "@/lib/workItems";
import { KindMark } from "./Deadlines";
import ProjectFilter from "./ProjectFilter";
import { PANEL_IDS } from "./StatTiles";

const VISIBLE_LANES = 3; // rows of bars per week before "+N more"
const FIRST_LANE_ROW = 2; // grid row of lane 0; the day numbers sit in row 1
const BAR_RADIUS = 4;
const BAR_INSET = 3; // gap at a bar's real ends, none where it continues

export default function CalendarView({
  projects,
  filterIds,
  onFilter,
  onSelect,
  onEditTask,
  onMoveTask,
  onMoveDeliverable,
}: {
  projects: Project[];
  filterIds: Set<number>;
  onFilter: (ids: Set<number>) => void;
  onSelect: (id: number) => void;
  onEditTask: (task: Task) => void;
  onMoveTask: (task: Task, date: string) => void;
  onMoveDeliverable: (milestone: Milestone, date: string) => void;
}) {
  const { t, locale } = useLang();
  const canEdit = useCanEdit();
  const today = todayStr();
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  // A bar spans days, so the drag remembers which of them was picked up: the
  // bar moves by the distance from that day to the one it is dropped on.
  const [dragging, setDragging] = useState<{
    span: CalendarSpan;
    grabbed: string;
  } | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;

  const allSpans = useMemo(() => calendarSpans(projects), [projects]);
  // Only projects with something to draw, so this panel's dropdown never offers
  // a pick that empties every month.
  const relevant = useMemo(
    () => new Set(allSpans.map((s) => s.project.id)),
    [allSpans]
  );
  const spans = useMemo(
    () =>
      filterIds.size === 0
        ? allSpans
        : allSpans.filter((s) => filterIds.has(s.project.id)),
    [allSpans, filterIds]
  );
  const undated = useMemo(
    () =>
      projects
        .filter((p) => filterIds.size === 0 || filterIds.has(p.id))
        .flatMap((p) => p.tasks)
        .filter((x) => !x.end_date).length,
    [projects, filterIds]
  );
  const weekdays = useMemo(() => weekdayInitials(locale), [locale]);

  const weeks = useMemo(() => {
    const cells = monthCells(year, monthIndex);
    while (cells.length % 7 !== 0) cells.push(null);
    const out: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      out.push(
        cells
          .slice(i, i + 7)
          .map((day) => (day === null ? null : ymd(year, monthIndex, day)))
      );
    }
    return out;
  }, [year, monthIndex]);

  function goTo(value: string) {
    setMonth(value);
    setOpenWeek(null);
  }

  function shift(delta: number) {
    const d = new Date(year, monthIndex + delta, 1);
    goTo(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // the date in a week's row under the pointer, null on a blank cell
  function dayAt(row: Element, clientX: number, days: (string | null)[]) {
    const rect = row.getBoundingClientRect();
    const column = Math.floor(((clientX - rect.left) / rect.width) * 7);
    return days[Math.min(Math.max(column, 0), 6)];
  }

  function drop(date: string) {
    if (!dragging) return;
    const { span, grabbed } = dragging;
    const days = daysBetween(grabbed, date);
    if (days === 0) return;
    const end = shiftDate(span.end, days);
    if (span.task) onMoveTask(span.task, end);
    else if (span.milestone) onMoveDeliverable(span.milestone, end);
  }

  function bar(
    { span, from, to, lane, continuesBefore, continuesAfter }: WeekSegment,
    days: (string | null)[]
  ) {
    const overdue = !span.done && span.end < today;
    const color = seriesVar(span.project.color_slot);
    const dates =
      span.start === span.end
        ? fmtDate(span.end, locale)
        : `${fmtDate(span.start, locale)} → ${fmtDate(span.end, locale)}`;
    const left = continuesBefore ? 0 : BAR_RADIUS;
    const right = continuesAfter ? 0 : BAR_RADIUS;
    return (
      <div
        key={span.key}
        draggable={canEdit}
        data-calendar-bar={span.key}
        className={`min-w-0 ${
          canEdit ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={{
          gridColumn: `${from + 1} / ${to + 2}`,
          gridRow: lane + FIRST_LANE_ROW,
          marginLeft: continuesBefore ? 0 : BAR_INSET,
          marginRight: continuesAfter ? 0 : BAR_INSET,
          opacity: dragging?.span.key === span.key ? 0.5 : 1,
        }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", span.name);
          const row = e.currentTarget.parentElement!;
          setDragging({
            span,
            grabbed: dayAt(row, e.clientX, days) ?? span.end,
          });
        }}
        onDragEnd={() => {
          setDragging(null);
          setOverDay(null);
        }}
      >
        <button
          type="button"
          title={`${span.name} · ${span.project.name} · ${dates}`}
          className={`flex w-full min-w-0 cursor-pointer items-center gap-1 px-1 text-left text-[14px] leading-[19px] hover:brightness-95 ${
            span.done ? "text-ink-3 line-through" : ""
          } ${overdue ? "font-medium text-[var(--status-critical)]" : ""}`}
          style={{
            borderRadius: `${left}px ${right}px ${right}px ${left}px`,
            background: span.done
              ? "var(--gridline)"
              : `color-mix(in srgb, ${color} 18%, transparent)`,
          }}
          onClick={() =>
            span.task ? onEditTask(span.task) : onSelect(span.project.id)
          }
        >
          <span className="shrink-0">
            <KindMark kind={span.kind} color={color} />
          </span>
          <span className="truncate">{span.name}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      id={PANEL_IDS.calendar}
      className="card scroll-mt-4 p-4"
      aria-label={t("calendarTitle")}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3">
          <h2 className="text-sm font-semibold">{t("calendarTitle")}</h2>
          <ProjectFilter
            projects={projects}
            relevant={relevant}
            value={filterIds}
            onChange={onFilter}
          />
          <span className="text-sm text-ink-2">
            {fmtMonthYear(new Date(year, monthIndex, 1), locale)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Holding a dragged bar over an arrow turns the page, so it can be
              dropped outside the month it started in. */}
          <button
            className="btn px-2 py-0.5 text-[16px]"
            aria-label={t("prevMonth")}
            onClick={() => shift(-1)}
            onDragEnter={() => dragging && shift(-1)}
          >
            ‹
          </button>
          <button
            className="btn px-2 py-0.5 text-[16px]"
            onClick={() => goTo(today.slice(0, 7))}
          >
            {t("goToToday")}
          </button>
          <button
            className="btn px-2 py-0.5 text-[16px]"
            aria-label={t("nextMonth")}
            onClick={() => shift(1)}
            onDragEnter={() => dragging && shift(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px] overflow-hidden rounded-lg border border-edge">
          <div className="grid grid-cols-7 border-b border-edge">
            {weekdays.map((w, i) => (
              <div key={i} className="py-1 text-center text-xs text-ink-3">
                {w}
              </div>
            ))}
          </div>

          {weeks.map((days, w) => {
            const segments = weekSegments(spans, days);
            const expanded = openWeek === w;
            const lanes = segments.reduce((n, s) => Math.max(n, s.lane + 1), 0);
            const shown = expanded
              ? segments
              : segments.filter((s) => s.lane < VISIBLE_LANES);
            const footerRow =
              FIRST_LANE_ROW + (expanded ? lanes : VISIBLE_LANES);
            return (
              <div
                key={days.find(Boolean)}
                data-calendar-week={w}
                className={`relative ${
                  w < weeks.length - 1 ? "border-b border-edge" : ""
                }`}
                onDragOver={(e) => {
                  if (!dragging) return;
                  const date = dayAt(e.currentTarget, e.clientX, days);
                  if (!date || date === dragging.grabbed) {
                    setOverDay(null);
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverDay(date);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                    setOverDay(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const date = dayAt(e.currentTarget, e.clientX, days);
                  if (date) drop(date);
                  setDragging(null);
                  setOverDay(null);
                }}
              >
                {/* column lines and blanks, behind the bars */}
                <div
                  className="absolute inset-0 grid grid-cols-7"
                  aria-hidden
                >
                  {days.map((date, c) => (
                    <div
                      key={c}
                      className={`${c < 6 ? "border-r border-edge" : ""} ${
                        date === null ? "bg-[var(--gridline)]/25" : ""
                      }`}
                      style={
                        date !== null && date === overDay
                          ? { boxShadow: "inset 0 0 0 2px var(--accent)" }
                          : undefined
                      }
                    />
                  ))}
                </div>

                <div className="relative grid min-h-24 grid-cols-7 content-start gap-y-0.5 pb-1">
                  {days.map((date, c) => {
                    if (date === null) return null;
                    const isToday = date === today;
                    return (
                      <div
                        key={date}
                        className={`m-1 mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${
                          isToday ? "font-semibold text-white" : "text-ink-2"
                        }`}
                        style={{
                          gridColumn: c + 1,
                          gridRow: 1,
                          ...(isToday ? { background: "var(--accent)" } : {}),
                        }}
                      >
                        {Number(date.slice(8))}
                      </div>
                    );
                  })}

                  {shown.map((s) => bar(s, days))}

                  {!expanded &&
                    days.map((_, c) => {
                      const more = segments.filter(
                        (s) =>
                          s.lane >= VISIBLE_LANES && s.from <= c && c <= s.to
                      ).length;
                      if (more === 0) return null;
                      return (
                        <button
                          key={c}
                          type="button"
                          className="cursor-pointer px-1 text-left text-[14px] text-ink-3 hover:text-ink hover:underline"
                          style={{ gridColumn: c + 1, gridRow: footerRow }}
                          aria-expanded={false}
                          onClick={() => setOpenWeek(w)}
                        >
                          {t("moreItems", { n: String(more) })}
                        </button>
                      );
                    })}

                  {expanded && lanes > VISIBLE_LANES && (
                    <button
                      type="button"
                      className="cursor-pointer justify-self-start px-1 text-[14px] text-ink-3 hover:text-ink hover:underline"
                      style={{ gridColumn: "1 / -1", gridRow: footerRow }}
                      aria-expanded
                      onClick={() => setOpenWeek(null)}
                    >
                      {t("showLess")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated > 0 && (
        <p className="mt-2 text-[15px] text-ink-3">
          {t("calendarUndated", { n: String(undated) })}
        </p>
      )}
    </section>
  );
}
