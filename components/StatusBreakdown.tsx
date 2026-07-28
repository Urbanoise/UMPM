"use client";

import { ReactNode, useMemo, useRef, useState } from "react";
import type { Project, Task } from "@/lib/types";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";
import { useLang, type StrKey } from "@/lib/i18n";
import { splitAssignees } from "@/lib/assignees";

// shared semantic scheme with Workload: gray = not started, green = underway,
// amber = paused, charcoal = done, red = overdue — status encoding (not identity)
const PROJECT_COLORS: Record<string, string> = {
  planned: "var(--text-muted)",
  active: "var(--status-good)",
  "on-hold": "var(--status-serious)",
  done: "var(--series-3)",
};
const TASK_COLORS: Record<string, string> = {
  todo: "var(--text-muted)",
  "in-progress": "var(--status-good)",
  done: "var(--series-3)",
};

function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

type Seg = { key: string; labelKey: StrKey; color: string; count: number };
type Group = {
  key: string;
  label: string;
  muted?: boolean;
  dotColor?: string;
  segs: Seg[];
  total: number;
};
type Tip = { x: number; y: number; body: ReactNode };

function taskSegs(tasks: Task[]): Seg[] {
  return TASK_STATUSES.map((s) => ({
    key: s,
    labelKey: `tstatus_${s}` as StrKey,
    color: TASK_COLORS[s],
    count: tasks.filter((x) => x.status === s).length,
  }));
}

function StackedBar({
  segs,
  width,
  onHover,
  onLeave,
}: {
  segs: Seg[];
  width: string;
  onHover: (e: React.PointerEvent, seg: Seg) => void;
  onLeave: () => void;
}) {
  const visible = segs.filter((s) => s.count > 0);
  return (
    <div className="flex h-4 flex-1 items-center">
      <div className="flex h-4 gap-[2px]" style={{ width }}>
        {visible.map((s, i) => (
          <div
            key={s.key}
            className={`${i === 0 ? "rounded-l-[4px]" : ""} ${
              i === visible.length - 1 ? "rounded-r-[4px]" : ""
            }`}
            style={{ background: s.color, flexGrow: s.count, flexBasis: 0 }}
            onPointerMove={(e) => onHover(e, s)}
            onPointerLeave={onLeave}
          />
        ))}
      </div>
    </div>
  );
}

export default function StatusBreakdown({
  projects,
}: {
  projects: Project[];
}) {
  const { t } = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const { projectSegs, allTaskSegs, byAssignee, byProject } = useMemo(() => {
    const projectSegs: Seg[] = PROJECT_STATUSES.map((s) => ({
      key: s,
      labelKey: `status_${s}` as StrKey,
      color: PROJECT_COLORS[s],
      count: projects.filter((p) => p.status === s).length,
    }));

    const allTasks = projects.flatMap((p) => p.tasks);

    const assignees = new Map<string | null, Task[]>();
    for (const task of allTasks) {
      const names = splitAssignees(task.assignee);
      const keys: (string | null)[] = names.length ? names : [null];
      for (const key of keys) {
        const list = assignees.get(key) ?? [];
        list.push(task);
        assignees.set(key, list);
      }
    }
    const byAssignee: Group[] = [...assignees.entries()]
      .map(([person, tasks]) => ({
        key: person ?? " unassigned",
        label: person ?? "",
        muted: person === null,
        segs: taskSegs(tasks),
        total: tasks.length,
      }))
      .sort((a, b) => {
        if (a.muted !== b.muted) return a.muted ? 1 : -1;
        return b.total - a.total || a.label.localeCompare(b.label);
      });

    const byProject: Group[] = projects
      .filter((p) => p.tasks.length > 0)
      .map((p) => ({
        key: String(p.id),
        label: p.name,
        dotColor: seriesVar(p.color_slot),
        segs: taskSegs(p.tasks),
        total: p.tasks.length,
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

    return { projectSegs, allTaskSegs: taskSegs(allTasks), byAssignee, byProject };
  }, [projects]);

  const projectTotal = projectSegs.reduce((s, x) => s + x.count, 0);
  const taskTotal = allTaskSegs.reduce((s, x) => s + x.count, 0);

  function onHover(e: React.PointerEvent, seg: Seg, total: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setTip({
      x: Math.min(Math.max(e.clientX - rect.left, 80), rect.width - 80),
      y: e.clientY - rect.top,
      body: (
        <div>
          <span className="font-semibold">{t(seg.labelKey)}</span>{" "}
          <span className="text-ink-2">
            {seg.count} · {Math.round((seg.count / total) * 100)}%
          </span>
        </div>
      ),
    });
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
            <StackedBar
              segs={segs}
              width="100%"
              onHover={(e, s) => onHover(e, s, total)}
              onLeave={() => setTip(null)}
            />
          )}
          <div className="w-6 shrink-0 text-right text-[13px] font-medium tabular-nums">
            {total}
          </div>
        </div>
        {legend(segs)}
      </div>
    );
  }

  function groupSection(titleKey: StrKey, groups: Group[]) {
    if (groups.length === 0) return null;
    const max = Math.max(1, ...groups.map((g) => g.total));
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {t(titleKey)}
        </h3>
        <div className="mt-1.5 space-y-1">
          {groups.map((g) => (
            <div key={g.key} className="flex items-center gap-3 py-0.5">
              <div className="flex w-24 shrink-0 items-center gap-1.5">
                {g.dotColor && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: g.dotColor }}
                    aria-hidden
                  />
                )}
                <span
                  className={`truncate text-[13px] ${
                    g.muted ? "italic text-ink-3" : ""
                  }`}
                >
                  {g.muted ? t("unassigned") : g.label}
                </span>
              </div>
              <StackedBar
                segs={g.segs}
                width={`${(g.total / max) * 100}%`}
                onHover={(e, s) => onHover(e, s, g.total)}
                onLeave={() => setTip(null)}
              />
              <div className="w-6 shrink-0 text-right text-[13px] font-medium tabular-nums">
                {g.total}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="card p-4" aria-label={t("breakdownTitle")}>
      <h2 className="text-sm font-semibold">{t("breakdownTitle")}</h2>
      <div ref={wrapRef} className="relative mt-4 space-y-4">
        {overviewRow(t("statProjects"), projectSegs, projectTotal)}
        {overviewRow(t("tasks"), allTaskSegs, taskTotal)}

        {(byAssignee.length > 0 || byProject.length > 0) && (
          <hr className="border-edge" />
        )}
        {groupSection("byAssignee", byAssignee)}
        {groupSection("byProject", byProject)}

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
      <table className="sr-only">
        <caption>{t("breakdownTitle")}</caption>
        <thead>
          <tr>
            <th />
            {TASK_STATUSES.map((s) => (
              <th key={s}>{t(`tstatus_${s}` as StrKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...byAssignee, ...byProject].map((g) => (
            <tr key={g.key}>
              <td>{g.muted ? t("unassigned") : g.label}</td>
              {g.segs.map((s) => (
                <td key={s.key}>{s.count}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
