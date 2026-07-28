"use client";

import type { Project } from "@/lib/types";
import { addDays, parseDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

function Tile({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="card flex-1 px-4 py-3">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-0.5 flex items-center gap-2 text-2xl font-semibold">
        {value}
        {alert && value > 0 && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--status-critical)" }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

export default function StatTiles({ projects }: { projects: Project[] }) {
  const { t } = useLang();
  const today = todayStr();
  const in30 = addDays(parseDate(today), 30).toISOString().slice(0, 10);

  const active = projects.filter((p) => p.status === "active").length;
  const upcomingMilestones = projects
    .flatMap((p) => p.milestones)
    .filter((m) => !m.done && m.due_date >= today && m.due_date <= in30).length;
  const overdue =
    projects
      .flatMap((p) => p.milestones)
      .filter((m) => !m.done && m.due_date < today).length +
    projects
      .filter((p) => p.status !== "done")
      .flatMap((p) => p.tasks)
      .filter((task) => task.status !== "done" && task.end_date && task.end_date < today)
      .length;

  return (
    <div className="flex flex-wrap gap-3">
      <Tile label={t("statProjects")} value={projects.length} />
      <Tile label={t("statActive")} value={active} />
      <Tile label={t("statMilestones30")} value={upcomingMilestones} />
      <Tile label={t("statOverdue")} value={overdue} alert />
    </div>
  );
}
