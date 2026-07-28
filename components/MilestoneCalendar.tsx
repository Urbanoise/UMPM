"use client";

import { ReactNode, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import { fmtMonthYear, todayStr, weekdayInitials } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

function typeColor(kind: "milestone" | "task") {
  return kind === "milestone" ? "var(--cal-milestone)" : "var(--cal-task)";
}

// overdue items go red, overriding the per-type hue
function markerColor(item: CalItem, today: string) {
  return !item.done && item.date < today
    ? "var(--status-critical)"
    : typeColor(item.kind);
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type CalItem = {
  key: string; // "m123" | "t456"
  kind: "milestone" | "task";
  name: string;
  date: string; // YYYY-MM-DD
  done: boolean;
  project: Project;
};
type Tip = { x: number; y: number; body: ReactNode };

export default function MilestoneCalendar({
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
  const [view, setView] = useState(() => today.slice(0, 7)); // YYYY-MM

  const year = Number(view.slice(0, 4));
  const month = Number(view.slice(5, 7)) - 1;

  const byDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const push = (item: CalItem) => {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    };
    for (const p of projects) {
      for (const m of p.milestones) {
        push({
          key: `m${m.id}`,
          kind: "milestone",
          name: m.name,
          date: m.due_date,
          done: !!m.done,
          project: p,
        });
      }
      for (const task of p.tasks) {
        if (!task.end_date) continue; // no deadline set
        push({
          key: `t${task.id}`,
          kind: "task",
          name: task.name,
          date: task.end_date,
          done: task.status === "done",
          project: p,
        });
      }
    }
    // within a day, show deliverables before task deadlines
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === "milestone" ? -1 : 1
      );
    }
    return map;
  }, [projects]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setView(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthLabel = fmtMonthYear(new Date(year, month, 1), locale);

  const weekdays = useMemo(() => weekdayInitials(locale), [locale]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function showTip(evt: React.PointerEvent | React.FocusEvent, items: CalItem[]) {
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
    setTip({
      x: Math.min(Math.max(cx, 110), rect.width - 110),
      y: cy,
      body: (
        <div className="space-y-1">
          {items.map((it) => {
            const overdue = !it.done && it.date < today;
            return (
              <div key={it.key}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 ${
                      it.kind === "milestone"
                        ? "rotate-45 rounded-[1px]"
                        : "rounded-full"
                    }`}
                    style={{ background: markerColor(it, today) }}
                    aria-hidden
                  />
                  <span className="text-[13px] font-semibold">{it.name}</span>
                </div>
                <div className="pl-3.5 text-ink-2">
                  {t(it.kind === "milestone" ? "typeMilestone" : "typeTask")} ·{" "}
                  {it.project.name} ·{" "}
                  {it.done ? (
                    t("msDone")
                  ) : overdue ? (
                    <span className="font-medium text-[var(--status-critical)]">
                      {t("msOverdue")}
                    </span>
                  ) : (
                    t("msUpcoming")
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ),
    });
  }

  return (
    <section className="card p-4" aria-label={t("calendarTitle")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{t("calendarTitle")}</h2>
          <span className="hidden items-center gap-2.5 text-[11px] text-ink-3 sm:flex">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rotate-45 rounded-[1px]"
                style={{ background: "var(--cal-milestone)" }}
                aria-hidden
              />
              {t("typeMilestone")}
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--cal-task)" }}
                aria-hidden
              />
              {t("typeTask")}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="btn px-2 py-0.5 text-[13px]"
            aria-label={t("prevMonth")}
            onClick={() => shift(-1)}
          >
            ‹
          </button>
          <span className="min-w-28 text-center text-[13px] text-ink-2">
            {monthLabel}
          </span>
          <button
            className="btn px-2 py-0.5 text-[13px]"
            aria-label={t("nextMonth")}
            onClick={() => shift(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-3">
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {weekdays.map((w, i) => (
            <div key={i} className="text-xs text-ink-3">
              {w}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />;
            const date = ymd(year, month, day);
            const items = byDate.get(date) ?? [];
            const isToday = date === today;
            const hasOverdue = items.some(
              (it) => !it.done && it.date < today
            );
            return (
              <div key={date} className="flex justify-center">
                <div
                  className={`flex h-11 w-9 flex-col items-center rounded-md pt-1 ${
                    items.length > 0 ? "cursor-pointer" : ""
                  }`}
                  style={
                    isToday
                      ? { boxShadow: "inset 0 0 0 1.5px var(--accent)" }
                      : undefined
                  }
                  {...(items.length > 0
                    ? {
                        tabIndex: 0,
                        role: "button",
                        "aria-label": `${date}: ${items
                          .map((it) => it.name)
                          .join(", ")}`,
                        onClick: () => onSelect(items[0].project.id),
                        onKeyDown: (e: React.KeyboardEvent) =>
                          e.key === "Enter" && onSelect(items[0].project.id),
                        onPointerMove: (e: React.PointerEvent) =>
                          showTip(e, items),
                        onPointerLeave: () => setTip(null),
                        onFocus: (e: React.FocusEvent) => showTip(e, items),
                        onBlur: () => setTip(null),
                      }
                    : {})}
                >
                  <span
                    className={`text-xs tabular-nums ${
                      isToday ? "font-semibold" : "text-ink-2"
                    }`}
                  >
                    {day}
                  </span>
                  <span className="mt-0.5 flex items-center gap-0.5">
                    {items.slice(0, 3).map((it) => (
                      <span
                        key={it.key}
                        className={`inline-block h-1.5 w-1.5 ${
                          it.kind === "milestone"
                            ? "rotate-45 rounded-[1px]"
                            : "rounded-full"
                        }`}
                        style={{
                          background: markerColor(it, today),
                          opacity: it.done ? 0.35 : 1,
                          boxShadow: hasOverdue
                            ? undefined
                            : "0 0 0 1px var(--surface-1)",
                        }}
                        aria-hidden
                      />
                    ))}
                    {items.length > 3 && (
                      <span className="text-[9px] leading-none text-ink-3">
                        +{items.length - 3}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

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
    </section>
  );
}
