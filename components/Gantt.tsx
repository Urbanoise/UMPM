"use client";

import {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { deliverableOf } from "@/lib/linked";
import type { Milestone, Project, Task, TaskCategory } from "@/lib/types";
import { isStarted, statusLabel } from "@/lib/taskStatus";
import { fmtDate, parseDate, todayStr, shiftDate } from "@/lib/dates";
import {
  shiftedProject,
  withDeliverableDate,
  withTaskChange,
} from "@/lib/workItems";
import { useCanEdit } from "@/lib/access";
import { useLang } from "@/lib/i18n";
import { fit } from "@/lib/exportGantt";
import {
  clampColumns,
  DEFAULT_GANTT_COLUMNS,
  useGanttColumns,
  type GanttColumns,
} from "@/lib/ganttColumns";

const TOP = 36; // axis header height
const ROW_H = 44;
const BAR_H = 16;
const TASK_ROW_H = 30; // sub-row for a task of the expanded project
const TASK_BAR_H = 10;
const RIGHT_PAD = 20;
const DAY = 86_400_000;
const RESIZE_KEY_STEP = 8; // px per arrow key press on a column divider

type Tip = { x: number; y: number; body: ReactNode };

function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const KA_MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtTick(d: Date, locale: string) {
  return locale.startsWith("ka")
    ? `${d.getDate()} ${KA_MONTHS[d.getMonth()]}`
    : `${EN_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type Drag = { id: number; fromIndex: number; y: number; overIndex: number };
type Resize = { key: keyof GanttColumns; startX: number; start: GanttColumns };

type BarMode = "move" | "start" | "end";
type BarTarget =
  | { kind: "project"; projectId: number }
  | { kind: "task"; projectId: number; task: Task }
  | { kind: "milestone"; projectId: number; milestone: Milestone };
type BarDrag = {
  target: BarTarget;
  mode: BarMode;
  startX: number;
  days: number;
};

const EDGE_PX = 6; // how close to a bar's end counts as grabbing that edge
const MIN_RESIZE_PX = 24; // narrower bars can only be moved

const earlier = (a: string, b: string) => (a < b ? a : b);
const later = (a: string, b: string) => (a > b ? a : b);

function resizedTask(task: Task, mode: BarMode, days: number) {
  const { start_date: start, end_date: end } = task;
  if (mode === "move") {
    return {
      start_date: start && shiftDate(start, days),
      end_date: end && shiftDate(end, days),
    };
  }
  if (mode === "start") {
    const moved = shiftDate((start ?? end)!, days);
    return { start_date: end ? earlier(moved, end) : moved, end_date: end };
  }
  const moved = shiftDate((end ?? start)!, days);
  return { start_date: start, end_date: start ? later(moved, start) : moved };
}

/** `p` as it will be once the drag lands, so the chart previews the result. */
function withBarDrag(p: Project, bar: BarDrag | null): Project {
  if (!bar || bar.days === 0 || bar.target.projectId !== p.id) return p;
  const { target, mode, days } = bar;
  if (target.kind === "task") {
    return withTaskChange(p, target.task.id, resizedTask(target.task, mode, days));
  }
  if (target.kind === "milestone") {
    const { milestone } = target;
    return withDeliverableDate(p, milestone, shiftDate(milestone.due_date, days));
  }
  if (mode === "move") return shiftedProject(p, days);
  return mode === "start"
    ? { ...p, start_date: earlier(shiftDate(p.start_date, days), p.end_date) }
    : { ...p, end_date: later(shiftDate(p.end_date, days), p.start_date) };
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** `s` cut with an ellipsis to fit `maxW` pixels in the page's own font. */
function fitText(s: string, maxW: number, size: number, weight = 400) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s;
  const family = getComputedStyle(document.body).fontFamily;
  measureCtx.font = `${weight} ${size}px ${family}`;
  return fit(measureCtx, s, maxW);
}

export default function Gantt({
  projects,
  selectedId,
  onSelect,
  onReorder,
  onMoveProject,
  onResizeProject,
  onChangeTask,
  categories,
  onMoveDeliverable,
}: {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onReorder?: (orderedIds: number[]) => void;
  onMoveProject: (project: Project, days: number) => void;
  onResizeProject: (project: Project, start: string, end: string) => void;
  onChangeTask: (task: Task, fields: Partial<Task>) => void;
  categories: TaskCategory[];
  onMoveDeliverable: (milestone: Milestone, date: string) => void;
}) {
  const { t, locale } = useLang();
  const canEdit = useCanEdit();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [tip, setTip] = useState<Tip | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [bar, setBar] = useState<BarDrag | null>(null);
  // Releasing a drag also fires a click, which must not select the project.
  const dragged = useRef(false);
  const { columns: savedColumns, setColumns } = useGanttColumns();
  const [liveColumns, setLiveColumns] = useState<GanttColumns | null>(null);
  const [resizing, setResizing] = useState<Resize | null>(null);
  const [activeDivider, setActiveDivider] = useState<keyof GanttColumns | null>(
    null
  );
  const [, setFontEpoch] = useState(0);
  const today = todayStr();
  const todayMs = parseDate(today).getTime();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(680, entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // names are fitted by measuring them, so re-render once the real fonts arrive
  useEffect(() => {
    const bump = () => setFontEpoch((n) => n + 1);
    document.fonts.ready.then(bump);
    document.fonts.addEventListener("loadingdone", bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);

  const { t0, t1 } = useMemo(() => {
    let min = todayMs;
    let max = todayMs;
    for (const p of projects) {
      min = Math.min(min, parseDate(p.start_date).getTime());
      max = Math.max(max, parseDate(p.end_date).getTime());
      for (const m of p.milestones) {
        min = Math.min(min, parseDate(m.due_date).getTime());
        max = Math.max(max, parseDate(m.due_date).getTime());
      }
      for (const task of p.tasks) {
        if (task.start_date) {
          min = Math.min(min, parseDate(task.start_date).getTime());
          max = Math.max(max, parseDate(task.start_date).getTime());
        }
        if (task.end_date) {
          min = Math.min(min, parseDate(task.end_date).getTime());
          max = Math.max(max, parseDate(task.end_date).getTime());
        }
      }
    }
    const pad = Math.max(7 * DAY, (max - min) * 0.04);
    return { t0: min - pad, t1: max + pad };
  }, [projects, todayMs]);

  const columns = clampColumns(liveColumns ?? savedColumns, width, RIGHT_PAD);
  const nameW = columns.name;
  const gutter = columns.name + columns.due; // everything left of the chart area
  const chartW = width - gutter - RIGHT_PAD;

  // The selected project expands to show its dated tasks as sub-rows, then any
  // deliverable no sub-row carries; a linked pair shares the task's row.
  const rows = useMemo(() => {
    const out: {
      p: Project;
      tasks: Task[];
      deliverables: Milestone[];
      yTop: number;
      h: number;
    }[] = [];
    let yTop = TOP;
    for (const source of projects) {
      const p = withBarDrag(source, bar);
      const tasks =
        p.id === selectedId
          ? p.tasks.filter((task) => task.start_date || task.end_date)
          : [];
      const deliverables =
        p.id === selectedId
          ? p.milestones.filter((m) => !tasks.some((x) => x.id === m.task_id))
          : [];
      const h = ROW_H + (tasks.length + deliverables.length) * TASK_ROW_H;
      out.push({ p, tasks, deliverables, yTop, h });
      yTop += h;
    }
    return out;
  }, [projects, selectedId, bar]);
  const last = rows[rows.length - 1];
  const height = (last ? last.yTop + last.h : TOP) + 12;
  const x = (t: number) => gutter + ((t - t0) / (t1 - t0)) * chartW;

  // pointer coordinate → insertion index among the project rows
  function insertIndexAtY(clientY: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return rows.length;
    const y = clientY - rect.top;
    for (let i = 0; i < rows.length; i++) {
      if (y < rows[i].yTop + rows[i].h / 2) return i;
    }
    return rows.length;
  }

  function beginDrag(e: React.PointerEvent, id: number, index: number) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setTip(null);
    const rect = wrapRef.current?.getBoundingClientRect();
    setDrag({
      id,
      fromIndex: index,
      y: rect ? e.clientY - rect.top : 0,
      overIndex: index,
    });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    setDrag((d) =>
      d
        ? {
            ...d,
            y: rect ? e.clientY - rect.top : d.y,
            overIndex: insertIndexAtY(e.clientY),
          }
        : d
    );
  }

  function endDrag(e: React.PointerEvent) {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (!drag) return;
    const { fromIndex, overIndex } = drag;
    setDrag(null);
    // dropping just above or below the original slot is a no-op
    if (overIndex === fromIndex || overIndex === fromIndex + 1) return;
    const ids = projects.map((p) => p.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(overIndex > fromIndex ? overIndex - 1 : overIndex, 0, moved);
    onReorder?.(ids);
  }

  // which part of a bar spanning x0..x1 the pointer is over, if any
  function zoneAt(e: React.PointerEvent, x0: number, x1: number): BarMode | null {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = e.clientX - rect.left;
    if (px < x0 - EDGE_PX || px > x1 + EDGE_PX) return null;
    if (x1 - x0 < MIN_RESIZE_PX) return "move";
    if (px <= x0 + EDGE_PX) return "start";
    return px >= x1 - EDGE_PX ? "end" : "move";
  }

  function showBarCursor(
    e: React.PointerEvent,
    x0: number,
    x1: number,
    fallback: string
  ) {
    if (bar) return;
    const zone = canEdit ? zoneAt(e, x0, x1) : null;
    (e.currentTarget as SVGElement).style.cursor =
      zone === "move" ? "grab" : zone ? "ew-resize" : fallback;
  }

  // Touch keeps meaning tap and scroll; bars are dragged with a mouse or pen.
  function beginBar(e: React.PointerEvent, target: BarTarget, mode: BarMode | null) {
    dragged.current = false;
    if (!canEdit || !mode || e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setBar({ target, mode, startX: e.clientX, days: 0 });
  }

  function moveBar(e: React.PointerEvent) {
    if (!bar) return;
    const pxPerDay = chartW / ((t1 - t0) / DAY);
    const days = Math.round((e.clientX - bar.startX) / pxPerDay);
    if (days !== bar.days) setBar({ ...bar, days });
  }

  function endBar(e: React.PointerEvent) {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (!bar) return;
    setBar(null);
    if (bar.days === 0) return;
    dragged.current = true;
    const { target, mode, days } = bar;
    const project = projects.find((p) => p.id === target.projectId);
    if (!project) return;
    if (target.kind === "task") {
      onChangeTask(target.task, resizedTask(target.task, mode, days));
    } else if (target.kind === "milestone") {
      const { milestone } = target;
      onMoveDeliverable(milestone, shiftDate(milestone.due_date, days));
    } else if (mode === "move") {
      onMoveProject(project, days);
    } else {
      const next = withBarDrag(project, bar);
      onResizeProject(project, next.start_date, next.end_date);
    }
  }

  function beginResize(e: React.PointerEvent, key: keyof GanttColumns) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setTip(null);
    setResizing({ key, startX: e.clientX, start: columns });
  }

  function moveResize(e: React.PointerEvent) {
    if (!resizing) return;
    const { key, startX, start } = resizing;
    setLiveColumns(
      clampColumns(
        { ...start, [key]: start[key] + e.clientX - startX },
        width,
        RIGHT_PAD
      )
    );
  }

  // saved only on release, so a drag is not a localStorage write per pixel
  function endResize(e: React.PointerEvent) {
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (liveColumns) setColumns(liveColumns);
    setLiveColumns(null);
    setResizing(null);
  }

  function resizeByKey(e: React.KeyboardEvent, key: keyof GanttColumns) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" ? -RESIZE_KEY_STEP : RESIZE_KEY_STEP;
    setColumns(
      clampColumns({ ...columns, [key]: columns[key] + step }, width, RIGHT_PAD)
    );
  }

  const weeks = useMemo(() => {
    const out: { t: number; label: string }[] = [];
    const d = new Date(t0);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // next Monday
    if (d.getTime() < t0) d.setDate(d.getDate() + 7);
    while (d.getTime() <= t1) {
      const dayMonth = fmtTick(d, locale);
      const label =
        out.length === 0 || (d.getMonth() === 0 && d.getDate() <= 7)
          ? `${dayMonth} ’${String(d.getFullYear()).slice(2)}`
          : dayMonth;
      out.push({ t: d.getTime(), label });
      d.setDate(d.getDate() + 7);
    }
    return out;
  }, [t0, t1, locale]);
  // at most 14 labels, fewer when the chart is too narrow to fit them
  const labelSlots = Math.max(2, Math.min(14, Math.floor(chartW / 92)));
  const labelStep = Math.max(1, Math.ceil(weeks.length / labelSlots));

  // first-of-month boundaries — the primary vertical rhythm
  const months = useMemo(() => {
    const out: number[] = [];
    const d = new Date(t0);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    if (d.getTime() < t0) d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= t1) {
      out.push(d.getTime());
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }, [t0, t1]);

  function showTip(evt: React.PointerEvent | React.FocusEvent, body: ReactNode) {
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
    setTip({ x: Math.min(Math.max(cx, 120), width - 120), y: cy, body });
  }

  function projectTip(p: Project) {
    const total = p.tasks.length;
    const done = p.tasks.filter((task) => task.status === "done").length;
    return (
      <div>
        <div className="font-semibold text-[16px]">{p.name}</div>
        <div className="mt-1 text-ink-2">
          <span className="font-medium text-ink">
            {fmtDate(p.start_date, locale)}
          </span>
          {" → "}
          <span className="font-medium text-ink">
            {fmtDate(p.end_date, locale)}
          </span>
          {p.tentative === 1 && (
            <span className="ml-1 text-[var(--text-muted)]">
              ({t("tentativeBadge")})
            </span>
          )}
        </div>
        <div className="text-ink-2">{t(`status_${p.status}`)}</div>
        {p.responsible && <div className="text-ink-2">{p.responsible}</div>}
        {total > 0 && (
          <div className="text-ink-2">
            <span className="font-medium text-ink">
              {done}/{total}
            </span>{" "}
            {t("tasksDoneSuffix")}
          </div>
        )}
      </div>
    );
  }

  function milestoneTip(p: Project, m: Milestone) {
    const overdue = !m.done && m.due_date < today;
    return (
      <div>
        <div className="font-semibold text-[16px]">◆ {m.name}</div>
        <div className="mt-1 text-ink-2">
          <span className="font-medium text-ink">
            {fmtDate(m.due_date, locale)}
          </span>
          {" · "}
          {truncate(p.name, 24)}
        </div>
        <div
          className={overdue ? "font-medium text-[var(--status-critical)]" : "text-ink-2"}
        >
          {m.done ? t("msDone") : overdue ? t("msOverdue") : t("msUpcoming")}
        </div>
      </div>
    );
  }

  function taskTip(p: Project, task: Task) {
    const overdue =
      task.status !== "done" && task.end_date !== null && task.end_date < today;
    const deliverable = deliverableOf(p, task);
    return (
      <div>
        <div className="font-semibold text-[16px]">{task.name}</div>
        {deliverable && deliverable.name !== task.name && (
          <div className="font-medium">◆ {deliverable.name}</div>
        )}
        <div className="mt-1 text-ink-2">
          {task.start_date && (
            <span className="font-medium text-ink">
              {fmtDate(task.start_date, locale)}
            </span>
          )}
          {task.start_date && task.end_date && " → "}
          {task.end_date && (
            <span className="font-medium text-ink">
              {fmtDate(task.end_date, locale)}
            </span>
          )}
          {" · "}
          {truncate(p.name, 24)}
        </div>
        <div
          className={overdue ? "font-medium text-[var(--status-critical)]" : "text-ink-2"}
        >
          {overdue ? t("msOverdue") : statusLabel(task.status, categories, t)}
        </div>
        {task.assignee && <div className="text-ink-2">{task.assignee}</div>}
      </div>
    );
  }

  // The ring keeps a finished diamond readable on a bar of its own colour.
  function diamond(m: Milestone, color: string) {
    const overdue = !m.done && m.due_date < today;
    return (
      <>
        <rect
          x={-8}
          y={-8}
          width={16}
          height={16}
          rx={2}
          transform="rotate(45)"
          fill="var(--surface-1)"
        />
        <rect
          x={-5.5}
          y={-5.5}
          width={11}
          height={11}
          rx={1.5}
          transform="rotate(45)"
          fill={m.done ? color : "var(--surface-1)"}
          stroke={overdue ? "var(--status-critical)" : color}
          strokeWidth={2}
          paintOrder="stroke"
        />
      </>
    );
  }

  function diamondHandle(p: Project, m: Milestone, selects: boolean) {
    return (
      <circle
        r={13}
        fill="transparent"
        style={{ cursor: !canEdit ? "pointer" : bar ? "grabbing" : "grab" }}
        onClick={() => {
          if (selects && !dragged.current) onSelect(p.id);
          dragged.current = false;
        }}
        onPointerDown={(e) =>
          beginBar(e, { kind: "milestone", projectId: p.id, milestone: m }, "move")
        }
        onPointerMove={(e) => {
          e.stopPropagation();
          moveBar(e);
          showTip(e, milestoneTip(p, m));
        }}
        onPointerUp={endBar}
        onPointerCancel={() => setBar(null)}
        onPointerLeave={() => setTip(null)}
      />
    );
  }

  if (projects.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} role="img" aria-label="Project timelines">
        {/* zebra row bands — give each project row a surface to sit on */}
        {rows.map(({ p, yTop, h }, i) =>
          i % 2 === 1 ? (
            <rect
              key={`zebra-${p.id}`}
              x={0}
              y={yTop}
              width={width}
              height={h}
              fill="var(--gridline)"
              opacity={0.22}
            />
          ) : null
        )}

        {/* thin horizontal separators between project rows */}
        {rows.map(({ p, yTop }, i) =>
          i > 0 ? (
            <line
              key={`sep-${p.id}`}
              x1={0}
              x2={width}
              y1={yTop}
              y2={yTop}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
          ) : null
        )}

        {/* faint weekly ticks + labels */}
        {weeks.map((m, i) => (
          <g key={m.t}>
            <line
              x1={x(m.t)}
              x2={x(m.t)}
              y1={TOP - 8}
              y2={height - 6}
              stroke="var(--gridline)"
              strokeWidth={1}
              opacity={0.45}
            />
            {i % labelStep === 0 && (
              <text
                x={x(m.t) + 4}
                y={18}
                fontSize={14}
                fill="var(--text-muted)"
              >
                {m.label}
              </text>
            )}
          </g>
        ))}

        {/* month boundaries — the primary vertical rhythm */}
        {months.map((mt) => (
          <line
            key={`month-${mt}`}
            x1={x(mt)}
            x2={x(mt)}
            y1={TOP - 8}
            y2={height - 6}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
        ))}

        {/* due date column heading */}
        <text
          x={gutter - 10}
          y={18}
          textAnchor="end"
          fontSize={14}
          fill="var(--text-muted)"
        >
          {t("colDue")}
        </text>

        {/* separator under the label gutter */}
        <line
          x1={gutter}
          x2={gutter}
          y1={TOP - 8}
          y2={height - 6}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        {/* axis baseline */}
        <line
          x1={gutter}
          x2={width - RIGHT_PAD}
          y1={TOP - 8}
          y2={TOP - 8}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {/* rows */}
        {rows.map(({ p, tasks, deliverables, yTop, h }, rowIndex) => {
          const yMid = yTop + ROW_H / 2;
          const start = parseDate(p.start_date).getTime();
          const end = Math.max(
            parseDate(p.end_date).getTime(),
            start + DAY / 2
          );
          const solidUntil =
            p.status === "done"
              ? end
              : Math.min(Math.max(todayMs, start), end);
          // Finished projects drop their series colour for a neutral grey so
          // they recede behind the work that is still live.
          const finished = p.status === "done";
          const color = finished ? "var(--baseline)" : seriesVar(p.color_slot);
          const selected = p.id === selectedId;
          // An unconfirmed start date is moot once the project is finished.
          const tentative = !finished && p.tentative === 1;
          return (
            <g key={p.id}>
              {selected && (
                <rect
                  x={6}
                  y={yTop + 3}
                  width={width - 12}
                  height={h - 6}
                  rx={8}
                  fill="var(--gridline)"
                  opacity={0.5}
                />
              )}
              {drag?.id === p.id && (
                <rect
                  x={6}
                  y={yTop + 3}
                  width={width - 12}
                  height={ROW_H - 6}
                  rx={8}
                  fill="var(--accent)"
                  opacity={0.1}
                />
              )}
              <text
                x={16}
                y={yMid + 4}
                textAnchor="start"
                fontSize={16}
                fontWeight={selected ? 600 : 400}
                fill={finished ? "var(--text-muted)" : "var(--text-primary)"}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(p.id)}
              >
                {fitText(p.name, nameW - 24, 16, selected ? 600 : 400)}
              </text>
              <text
                x={gutter - 10}
                y={yMid + 4}
                textAnchor="end"
                fontSize={14.5}
                fill={
                  finished
                    ? "var(--text-muted)"
                    : p.end_date < today
                      ? "var(--status-critical)"
                      : "var(--text-secondary)"
                }
              >
                {fmtDate(p.end_date, locale)}
              </text>

              {/* full span, de-emphasised (remaining time) */}
              <rect
                x={x(start)}
                y={yMid - BAR_H / 2}
                width={Math.max(x(end) - x(start), 3)}
                height={BAR_H}
                rx={4}
                fill={color}
                opacity={tentative ? 0.16 : 0.32}
              />
              {tentative ? (
                <>
                  {/* provisional outline — start date not yet confirmed */}
                  <rect
                    x={x(start)}
                    y={yMid - BAR_H / 2}
                    width={Math.max(x(end) - x(start), 3)}
                    height={BAR_H}
                    rx={4}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={x(start) - 4}
                    y={yMid + 3.5}
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={600}
                    fill={color}
                  >
                    ?
                  </text>
                </>
              ) : (
                /* elapsed portion, solid */
                solidUntil > start && (
                  <rect
                    x={x(start)}
                    y={yMid - BAR_H / 2}
                    width={Math.max(x(solidUntil) - x(start), 2)}
                    height={BAR_H}
                    rx={4}
                    fill={color}
                  />
                )
              )}

              {/* row hit target */}
              <rect
                x={0}
                y={yTop}
                width={width}
                height={ROW_H}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${p.name}, ${fmtDate(p.start_date, locale)} → ${fmtDate(p.end_date, locale)}`}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (!dragged.current) onSelect(p.id);
                  dragged.current = false;
                }}
                onKeyDown={(e) => e.key === "Enter" && onSelect(p.id)}
                onPointerDown={(e) =>
                  beginBar(
                    e,
                    { kind: "project", projectId: p.id },
                    zoneAt(e, x(start), x(end))
                  )
                }
                onPointerMove={(e) => {
                  moveBar(e);
                  showBarCursor(e, x(start), x(end), "pointer");
                  showTip(e, projectTip(p));
                }}
                onPointerUp={endBar}
                onPointerCancel={() => setBar(null)}
                onPointerLeave={() => setTip(null)}
                onFocus={(e) => showTip(e, projectTip(p))}
                onBlur={() => setTip(null)}
              />

              {/* drag handle — reorder projects freely */}
              {canEdit && (
<g
                transform={`translate(10, ${yMid})`}
                style={{ cursor: drag ? "grabbing" : "grab" }}
                role="button"
                aria-label={`${t("dragReorder")}: ${p.name}`}
                onPointerDown={(e) => beginDrag(e, p.id, rowIndex)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <rect x={-6} y={-11} width={18} height={22} fill="transparent" />
                {[-4, 0, 4].map((gy) => (
                  <g key={gy} fill="var(--text-muted)">
                    <circle cx={0} cy={gy} r={1.1} />
                    <circle cx={4} cy={gy} r={1.1} />
                  </g>
                ))}
              </g>
)}

              {/* milestones */}
              {p.milestones.map((m) => {
                const mx = x(parseDate(m.due_date).getTime());
                return (
                  <g key={m.id} transform={`translate(${mx}, ${yMid})`}>
                    {diamond(m, color)}
                    {diamondHandle(p, m, true)}
                  </g>
                );
              })}

              {/* task sub-rows (expanded project only) */}
              {tasks.map((task, j) => {
                const rowTop = yTop + ROW_H + j * TASK_ROW_H;
                const tMid = rowTop + TASK_ROW_H / 2;
                const ts = parseDate(
                  (task.start_date ?? task.end_date)!
                ).getTime();
                const te = Math.max(
                  parseDate((task.end_date ?? task.start_date)!).getTime(),
                  ts + DAY / 2
                );
                const done = task.status === "done";
                const overdue =
                  !done && task.end_date !== null && task.end_date < today;
                const deliverable = deliverableOf(p, task);
                const tSolidUntil = done
                  ? te
                  : isStarted(task.status)
                    ? Math.min(Math.max(todayMs, ts), te)
                    : ts;
                return (
                  <g key={`task-${task.id}`}>
                    <text
                      x={28}
                      y={tMid + 3.5}
                      textAnchor="start"
                      fontSize={14.5}
                      fill="var(--text-secondary)"
                    >
                      {fitText(task.name, nameW - 36, 14.5)}
                    </text>
                    <text
                      x={gutter - 10}
                      y={tMid + 3.5}
                      textAnchor="end"
                      fontSize={14}
                      fill={
                        overdue
                          ? "var(--status-critical)"
                          : done
                            ? "var(--text-muted)"
                            : "var(--text-secondary)"
                      }
                    >
                      {fmtDate(task.end_date, locale)}
                    </text>
                    <rect
                      x={x(ts)}
                      y={tMid - TASK_BAR_H / 2}
                      width={Math.max(x(te) - x(ts), 3)}
                      height={TASK_BAR_H}
                      rx={3}
                      fill={color}
                      opacity={0.28}
                    />
                    {tSolidUntil > ts && (
                      <rect
                        x={x(ts)}
                        y={tMid - TASK_BAR_H / 2}
                        width={Math.max(x(tSolidUntil) - x(ts), 2)}
                        height={TASK_BAR_H}
                        rx={3}
                        fill={color}
                      />
                    )}
                    {overdue && (
                      <rect
                        x={x(ts)}
                        y={tMid - TASK_BAR_H / 2}
                        width={Math.max(x(te) - x(ts), 3)}
                        height={TASK_BAR_H}
                        rx={3}
                        fill="transparent"
                        stroke="var(--status-critical)"
                        strokeWidth={1.5}
                      />
                    )}
                    <rect
                      x={0}
                      y={rowTop}
                      width={width}
                      height={TASK_ROW_H}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={task.name}
                      onPointerDown={(e) =>
                        beginBar(
                          e,
                          { kind: "task", projectId: p.id, task },
                          zoneAt(e, x(ts), x(te))
                        )
                      }
                      onPointerMove={(e) => {
                        moveBar(e);
                        showBarCursor(e, x(ts), x(te), "default");
                        showTip(e, taskTip(p, task));
                      }}
                      onPointerUp={endBar}
                      onPointerCancel={() => setBar(null)}
                      onPointerLeave={() => setTip(null)}
                      onFocus={(e) => showTip(e, taskTip(p, task))}
                      onBlur={() => setTip(null)}
                    />
                    {/* no handle: it would cover the bar's end, which resizes */}
                    {deliverable && (
                      <g
                        transform={`translate(${x(parseDate(deliverable.due_date).getTime())}, ${tMid})`}
                        pointerEvents="none"
                      >
                        {diamond(deliverable, color)}
                      </g>
                    )}
                  </g>
                );
              })}

              {/* deliverables with no task sub-row (expanded project only) */}
              {deliverables.map((m, j) => {
                const rowTop = yTop + ROW_H + (tasks.length + j) * TASK_ROW_H;
                const tMid = rowTop + TASK_ROW_H / 2;
                const overdue = !m.done && m.due_date < today;
                return (
                  <g key={`deliverable-${m.id}`}>
                    <text
                      x={28}
                      y={tMid + 3.5}
                      textAnchor="start"
                      fontSize={14.5}
                      fill="var(--text-secondary)"
                    >
                      {fitText(m.name, nameW - 36, 14.5)}
                    </text>
                    <text
                      x={gutter - 10}
                      y={tMid + 3.5}
                      textAnchor="end"
                      fontSize={14}
                      fill={
                        overdue
                          ? "var(--status-critical)"
                          : m.done
                            ? "var(--text-muted)"
                            : "var(--text-secondary)"
                      }
                    >
                      {fmtDate(m.due_date, locale)}
                    </text>
                    <rect
                      x={0}
                      y={rowTop}
                      width={width}
                      height={TASK_ROW_H}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={m.name}
                      onPointerMove={(e) => showTip(e, milestoneTip(p, m))}
                      onPointerLeave={() => setTip(null)}
                      onFocus={(e) => showTip(e, milestoneTip(p, m))}
                      onBlur={() => setTip(null)}
                    />
                    <g
                      transform={`translate(${x(parseDate(m.due_date).getTime())}, ${tMid})`}
                    >
                      {diamond(m, color)}
                      {diamondHandle(p, m, false)}
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* drag overlay: insertion indicator + label following the cursor */}
        {drag &&
          (() => {
            const insY =
              drag.overIndex < rows.length
                ? rows[drag.overIndex].yTop
                : last
                  ? last.yTop + last.h
                  : TOP;
            const showLine =
              drag.overIndex !== drag.fromIndex &&
              drag.overIndex !== drag.fromIndex + 1;
            return (
              <g pointerEvents="none">
                {showLine && (
                  <>
                    <line
                      x1={6}
                      x2={width - 6}
                      y1={insY}
                      y2={insY}
                      stroke="var(--accent)"
                      strokeWidth={2}
                    />
                    <circle cx={6} cy={insY} r={3} fill="var(--accent)" />
                  </>
                )}
                <text
                  x={16}
                  y={drag.y + 4}
                  textAnchor="start"
                  fontSize={16}
                  fontWeight={600}
                  fill="var(--accent)"
                >
                  {fitText(projects[drag.fromIndex]?.name ?? "", nameW - 24, 16, 600)}
                </text>
              </g>
            );
          })()}

        {/* today line */}
        <line
          x1={x(todayMs)}
          x2={x(todayMs)}
          y1={TOP - 8}
          y2={height - 6}
          stroke="var(--text-muted)"
          strokeWidth={1.5}
        />
        <text
          x={x(todayMs) + 5}
          y={TOP + 2}
          fontSize={13}
          fontWeight={600}
          fill="var(--text-muted)"
        >
          {t("today")}
        </text>

        {/* column dividers — last, so they sit above the row hit targets */}
        {(["name", "due"] as const).map((key) => {
          const dx = key === "name" ? nameW : gutter;
          const active = resizing?.key === key || activeDivider === key;
          return (
            <g key={`divider-${key}`}>
              <line
                x1={dx}
                x2={dx}
                y1={active ? 8 : 10}
                y2={active ? height - 6 : TOP - 8}
                stroke={active ? "var(--accent)" : "var(--baseline)"}
                strokeWidth={active ? 2 : 1}
                pointerEvents="none"
              />
              <rect
                x={dx - 5}
                y={0}
                width={10}
                height={height}
                fill="transparent"
                tabIndex={0}
                role="separator"
                aria-orientation="vertical"
                aria-label={`${t("resizeColumn")}: ${t(key === "name" ? "colName" : "colDue")}`}
                aria-valuenow={columns[key]}
                style={{ cursor: "col-resize", touchAction: "none", outline: "none" }}
                onPointerDown={(e) => beginResize(e, key)}
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                onPointerEnter={() => setActiveDivider(key)}
                onPointerLeave={() => setActiveDivider(null)}
                onFocus={() => setActiveDivider(key)}
                onBlur={() => setActiveDivider(null)}
                onKeyDown={(e) => resizeByKey(e, key)}
                onDoubleClick={() =>
                  setColumns({ ...columns, [key]: DEFAULT_GANTT_COLUMNS[key] })
                }
              />
            </g>
          );
        })}
      </svg>

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
  );
}
