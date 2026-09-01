"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, Task } from "@/lib/types";
import { useLang, type Lang, type StrKey } from "@/lib/i18n";
import { applyTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import { splitAssignees } from "@/lib/assignees";
import Gantt from "./Gantt";
import StatTiles from "./StatTiles";
import WorkOverview from "./WorkOverview";
import Deadlines from "./Deadlines";
import ProjectHealth from "./ProjectHealth";
import MilestoneCalendar from "./MilestoneCalendar";
import ProjectPanel from "./ProjectPanel";
import ProjectFormModal from "./ProjectFormModal";
import TaskFormModal from "./TaskFormModal";
import ContractUploadModal from "./ContractUploadModal";
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
    "closed" | "create" | "edit" | "contract"
  >("closed");
  const [editTask, setEditTask] = useState<Task | null>(null);
  // One project filter behind both overview panels, so narrowing either one
  // narrows the other.
  const [panelFilterId, setPanelFilterId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);

  const reorder = useCallback(async (orderedIds: number[]) => {
    // optimistic: reshuffle local state immediately, then persist
    setProjects((cur) => {
      if (!cur) return cur;
      const byId = new Map(cur.map((p) => [p.id, p]));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is Project => p !== undefined);
      return next.length === cur.length ? next : cur;
    });
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderedIds }),
    });
  }, []);

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

  // A filtered project can be deleted or renamed away under us; fall back to
  // "all projects" rather than leaving both panels stuck on a dead id.
  const filterId =
    projects?.some((p) => p.id === panelFilterId) ? panelFilterId : null;

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
          <button className="btn" onClick={() => setModal("contract")}>
            {t("uploadContract")}
          </button>
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
          <div className="card overflow-x-auto p-4">
            <Gantt
              projects={projects}
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
              filterId={filterId}
              onFilter={setPanelFilterId}
              onSelect={(id) => setSelectedId(id)}
              onEditTask={setEditTask}
            />
            <Deadlines
              projects={projects}
              filterId={filterId}
              onFilter={setPanelFilterId}
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
