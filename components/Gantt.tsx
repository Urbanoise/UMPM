"use client";

import {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Milestone, Project, Task } from "@/lib/types";
import { fmtDate, parseDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

const TOP = 36; // axis header height
const ROW_H = 44;
const BAR_H = 16;
const TASK_ROW_H = 30; // sub-row for a task of the expanded project
const TASK_BAR_H = 10;
const GUTTER = 180; // left label column
const RIGHT_PAD = 20;
const DAY = 86_400_000;

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

export default function Gantt({
  projects,
  selectedId,
  onSelect,
  onReorder,
}: {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onReorder?: (orderedIds: number[]) => void;
}) {
  const { t, locale } = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [tip, setTip] = useState<Tip | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const today = todayStr();
  const todayMs = parseDate(today).getTime();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(560, entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
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

  const chartW = width - GUTTER - RIGHT_PAD;

  // the selected project expands to show its dated tasks as sub-rows
  const rows = useMemo(() => {
    const out: { p: Project; tasks: Task[]; yTop: number; h: number }[] = [];
    let yTop = TOP;
    for (const p of projects) {
      const tasks =
        p.id === selectedId
          ? p.tasks.filter((task) => task.start_date || task.end_date)
          : [];
      const h = ROW_H + tasks.length * TASK_ROW_H;
      out.push({ p, tasks, yTop, h });
      yTop += h;
    }
    return out;
  }, [projects, selectedId]);
  const last = rows[rows.length - 1];
  const height = (last ? last.yTop + last.h : TOP) + 12;
  const x = (t: number) => GUTTER + ((t - t0) / (t1 - t0)) * chartW;

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
  const labelStep = Math.max(1, Math.ceil(weeks.length / 14));

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
        <div className="font-semibold text-[13px]">{p.name}</div>
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
        <div className="font-semibold text-[13px]">◆ {m.name}</div>
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
    return (
      <div>
        <div className="font-semibold text-[13px]">{task.name}</div>
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
          {overdue ? t("msOverdue") : t(`tstatus_${task.status}`)}
        </div>
        {task.assignee && <div className="text-ink-2">{task.assignee}</div>}
      </div>
    );
  }

  if (projects.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} role="img" aria-label="Project timelines">
        {/* weekly (Monday) gridlines + labels */}
        {weeks.map((m, i) => (
          <g key={m.t}>
            <line
              x1={x(m.t)}
              x2={x(m.t)}
              y1={TOP - 8}
              y2={height - 6}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            {i % labelStep === 0 && (
              <text
                x={x(m.t) + 4}
                y={18}
                fontSize={11}
                fill="var(--text-muted)"
              >
                {m.label}
              </text>
            )}
          </g>
        ))}
        {/* axis baseline */}
        <line
          x1={GUTTER}
          x2={width - RIGHT_PAD}
          y1={TOP - 8}
          y2={TOP - 8}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {/* rows */}
        {rows.map(({ p, tasks, yTop, h }, rowIndex) => {
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
          const color = seriesVar(p.color_slot);
          const selected = p.id === selectedId;
          const tentative = p.tentative === 1;
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
                x={GUTTER - 12}
                y={yMid + 4}
                textAnchor="end"
                fontSize={13}
                fontWeight={selected ? 600 : 400}
                fill="var(--text-primary)"
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(p.id)}
              >
                {truncate(p.name, 22)}
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
                    fontSize={9}
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
                onClick={() => onSelect(p.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(p.id)}
                onPointerMove={(e) => showTip(e, projectTip(p))}
                onPointerLeave={() => setTip(null)}
                onFocus={(e) => showTip(e, projectTip(p))}
                onBlur={() => setTip(null)}
              />

              {/* drag handle — reorder projects freely */}
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

              {/* milestones */}
              {p.milestones.map((m) => {
                const mx = x(parseDate(m.due_date).getTime());
                const overdue = !m.done && m.due_date < today;
                return (
                  <g key={m.id} transform={`translate(${mx}, ${yMid})`}>
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
                    <circle
                      r={13}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onClick={() => onSelect(p.id)}
                      onPointerMove={(e) => {
                        e.stopPropagation();
                        showTip(e, milestoneTip(p, m));
                      }}
                      onPointerLeave={() => setTip(null)}
                    />
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
                const tSolidUntil = done
                  ? te
                  : task.status === "in-progress"
                    ? Math.min(Math.max(todayMs, ts), te)
                    : ts;
                return (
                  <g key={`task-${task.id}`}>
                    <text
                      x={GUTTER - 12}
                      y={tMid + 3.5}
                      textAnchor="end"
                      fontSize={11.5}
                      fill="var(--text-secondary)"
                    >
                      {truncate(task.name, 24)}
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
                      onPointerMove={(e) => showTip(e, taskTip(p, task))}
                      onPointerLeave={() => setTip(null)}
                      onFocus={(e) => showTip(e, taskTip(p, task))}
                      onBlur={() => setTip(null)}
                    />
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
                  x={GUTTER - 12}
                  y={drag.y + 4}
                  textAnchor="end"
                  fontSize={13}
                  fontWeight={600}
                  fill="var(--accent)"
                >
                  {truncate(projects[drag.fromIndex]?.name ?? "", 22)}
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
          fontSize={10}
          fontWeight={600}
          fill="var(--text-muted)"
        >
          {t("today")}
        </text>
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
