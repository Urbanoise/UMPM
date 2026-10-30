"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, Task } from "@/lib/types";
import { useLang, type Lang, type StrKey } from "@/lib/i18n";
import { applyTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import { splitAssignees } from "@/lib/assignees";
import Gantt from "./Gantt";
import StatTiles, { PANEL_IDS } from "./StatTiles";
import WorkOverview from "./WorkOverview";
import Deadlines from "./Deadlines";
import ProjectHealth from "./ProjectHealth";
import MilestoneCalendar from "./MilestoneCalendar";
import ProjectPanel from "./ProjectPanel";
import ProjectFormModal from "./ProjectFormModal";
import TaskFormModal from "./TaskFormModal";
import ContractUploadModal from "./ContractUploadModal";
import ExportModal from "./ExportModal";
import ProjectFilter from "./ProjectFilter";
import Logo from "./Logo";

function LangToggle() {
  const { lang, setLang } = useLang();
  const opts: { value: Lang; label: string }[] = [
    { value: "ka", label: "ქარ" },
    { value: "en", label: "ENG" },
  ];
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-edge text-[13px]"
      role="group"
      aria-label="Language"
    >
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          className="px-2.5 py-1 font-medium"
          style={
            lang === o.value
              ? { background: "var(--accent)", color: "#ffffff" }
              : { color: "var(--text-secondary)" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ThemeToggle() {
  const { t } = useLang();
  const { choice, theme, setTheme } = useTheme();

  // Mirror the resolved theme onto <html data-theme>, which is what globals.css
  // selects on. The buttons track `choice`, so "system" stays lit even though
  // the page is painted light or dark.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const opts: { value: ThemeChoice; glyph: string; label: StrKey }[] = [
    { value: "system", glyph: "◐", label: "themeSystem" },
    { value: "light", glyph: "☀︎", label: "themeLight" },
    { value: "dark", glyph: "☾︎", label: "themeDark" },
  ];
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-edge text-[13px]"
      role="group"
      aria-label={t("themeLabel")}
    >
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          aria-pressed={choice === o.value}
          aria-label={t(o.label)}
          title={t(o.label)}
          className="px-2.5 py-1 leading-5 font-medium"
          style={
            choice === o.value
              ? { background: "var(--accent)", color: "#ffffff" }
              : { color: "var(--text-secondary)" }
          }
        >
          {o.glyph}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { t, lang } = useLang();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<
    "closed" | "create" | "edit" | "contract" | "export"
  >("closed");
  const [editTask, setEditTask] = useState<Task | null>(null);
  // One project filter behind the timeline and both overview panels, so
  // narrowing any one narrows the others. Empty means "all projects".
  const [filterPicked, setFilterPicked] = useState<Set<number>>(
    () => new Set()
  );
  // Finished projects are hidden from the timeline unless asked for.
  const [showPast, setShowPast] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);

  const reorder = useCallback(
    async (visibleIds: number[]) => {
      if (!projects) return;
      // The timeline may be hiding finished projects, so it only reports the
      // order of the rows it shows. Hidden projects keep their slots and the
      // visible ones are poured into the remaining slots in their new order.
      const visible = new Set(visibleIds);
      let i = 0;
      const orderedIds = projects.map((p) =>
        visible.has(p.id) ? visibleIds[i++] : p.id
      );
      // optimistic: reshuffle local state immediately, then persist
      const byId = new Map(projects.map((p) => [p.id, p]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is Project => p !== undefined);
      if (next.length === projects.length) setProjects(next);
      await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderedIds }),
      });
    },
    [projects]
  );

  // keep <html lang> in sync (useUiLang and screen readers rely on it)
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProjects(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = projects?.find((p) => p.id === selectedId) ?? null;

  const hasPast = projects?.some((p) => p.status === "done") ?? false;
  // A filtered project can be deleted under us; its id drops out here so a
  // dead id can never leave the panels filtered down to nothing.
  const picked = useMemo(
    () =>
      new Set(
        (projects ?? [])
          .filter((p) => filterPicked.has(p.id))
          .map((p) => p.id)
      ),
    [projects, filterPicked]
  );
  // The timeline's own list offers what "show past" allows.
  const timelineRelevant = useMemo(
    () =>
      new Set(
        (projects ?? [])
          .filter((p) => showPast || p.status !== "done")
          .map((p) => p.id)
      ),
    [projects, showPast]
  );
  // An explicit pick wins over "show past": a finished project the user ticked
  // stays on the timeline.
  const timelineProjects = useMemo(
    () =>
      picked.size > 0
        ? (projects ?? []).filter((p) => picked.has(p.id))
        : showPast
          ? (projects ?? [])
          : (projects ?? []).filter((p) => p.status !== "done"),
    [projects, showPast, picked]
  );

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects ?? []) {
      if (p.responsible) set.add(p.responsible);
      for (const task of p.tasks)
        for (const name of splitAssignees(task.assignee)) set.add(name);
    }
    return [...set].sort();
  }, [projects]);

  if (projects === null) {
    return <p className="p-8 text-sm text-ink-3">{t("loading")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span
            className="hidden h-9 w-px bg-edge sm:block"
            aria-hidden
          />
          <h1 className="hidden text-lg font-semibold text-ink-2 sm:block">
            {t("appTitle")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LangToggle />
          {projects.length > 0 && (
            <button className="btn" onClick={() => setModal("export")}>
              {t("export")}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setModal("create")}>
            {t("newProject")}
          </button>
        </div>
      </header>

      <StatTiles projects={projects} />

      {projects.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-ink-2">{t("emptyState")}</p>
          <button className="btn btn-primary" onClick={() => setModal("create")}>
            {t("newProject")}
          </button>
        </div>
      ) : (
        <>
          <div id={PANEL_IDS.gantt} className="card scroll-mt-4 overflow-x-auto p-4">
            <div className="mb-2 flex flex-wrap items-center gap-4 empty:hidden">
              <ProjectFilter
                projects={projects}
                relevant={timelineRelevant}
                value={picked}
                onChange={setFilterPicked}
              />
              {hasPast && (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={showPast}
                    onChange={(e) => setShowPast(e.target.checked)}
                  />
                  {t("showPastProjects")}
                </label>
              )}
            </div>
            {timelineProjects.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-3">
                {t("noActiveProjects")}
              </p>
            )}
            <Gantt
              projects={timelineProjects}
              selectedId={selectedId}
              onSelect={(id) =>
                setSelectedId((cur) => (cur === id ? null : id))
              }
              onReorder={reorder}
            />
          </div>

          {selected ? (
            <ProjectPanel
              project={selected}
              people={people}
              onChanged={refresh}
              onEditTask={setEditTask}
              onEdit={() => setModal("edit")}
              onDeleted={() => {
                setSelectedId(null);
                refresh();
              }}
            />
          ) : (
            <p className="px-1 text-sm text-ink-3">{t("hint")}</p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkOverview
              projects={projects}
              filterIds={picked}
              onFilter={setFilterPicked}
              onSelect={(id) => setSelectedId(id)}
              onEditTask={setEditTask}
            />
            <Deadlines
              projects={projects}
              filterIds={picked}
              onFilter={setFilterPicked}
              onSelect={(id) => setSelectedId(id)}
              onEditTask={setEditTask}
            />
          </div>
          <ProjectHealth
            projects={projects}
            onSelect={(id) => setSelectedId(id)}
          />
          <MilestoneCalendar
            projects={projects}
            onSelect={(id) => setSelectedId(id)}
          />
        </>
      )}

      {editTask && (
        <TaskFormModal
          task={editTask}
          people={people}
          onClose={() => setEditTask(null)}
          onSaved={() => {
            setEditTask(null);
            refresh();
          }}
        />
      )}

      {modal === "export" && (
        <ExportModal
          projects={projects}
          initialId={selectedId}
          onClose={() => setModal("closed")}
        />
      )}

      {modal === "contract" && (
        <ContractUploadModal
          people={people}
          onClose={() => setModal("closed")}
          onCreated={(id) => {
            setModal("closed");
            setSelectedId(id);
            refresh();
          }}
        />
      )}

      {(modal === "create" || modal === "edit") && (
        <ProjectFormModal
          initial={modal === "edit" ? selected : null}
          people={people}
          // Only offered while creating: importing a contract makes a new
          // project, it cannot fill in the one being edited.
          onUploadContract={
            modal === "create" ? () => setModal("contract") : undefined
          }
          onClose={() => setModal("closed")}
          onSaved={() => {
            setModal("closed");
            refresh();
          }}
        />
      )}
    </div>
  );
}
