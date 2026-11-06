"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Milestone,
  Project,
  Task,
  TaskCategory,
  TaskStatus,
} from "@/lib/types";
import { CanEditContext } from "@/lib/access";
import { useLang, type Lang, type StrKey } from "@/lib/i18n";
import { applyTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import { splitAssignees } from "@/lib/assignees";
import {
  shiftedProject,
  withDeadline,
  withDeliverableDate,
  withTaskChange,
} from "@/lib/workItems";
import {
  changeLabel,
  diffCategories,
  diffProjects,
  reversed,
  type RowChange,
  type TrackEdit,
} from "@/lib/undo";
import {
  DASHBOARD_VIEWS,
  useDashboardView,
  type DashboardView,
} from "@/lib/viewMode";
import { taskOf } from "@/lib/linked";
import Gantt from "./Gantt";
import BoardView from "./BoardView";
import ListView from "./ListView";
import CalendarView from "./CalendarView";
import StatTiles, { PANEL_IDS, prefersReducedMotion } from "./StatTiles";
import WorkOverview from "./WorkOverview";
import Deadlines from "./Deadlines";
import ProjectHealth from "./ProjectHealth";
import ProjectPanel from "./ProjectPanel";
import ProjectFormModal from "./ProjectFormModal";
import TaskFormModal from "./TaskFormModal";
import ContractUploadModal from "./ContractUploadModal";
import ExportModal from "./ExportModal";
import AddCategory from "./AddCategory";
import CategoryModal from "./CategoryModal";
import OutboxModal, { type Outbox } from "./OutboxModal";
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
      className="flex overflow-hidden rounded-lg border border-edge text-[16px]"
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
      className="flex overflow-hidden rounded-lg border border-edge text-[16px]"
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

function ViewSwitcher({
  view,
  onChange,
}: {
  view: DashboardView;
  onChange: (view: DashboardView) => void;
}) {
  const { t } = useLang();
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-edge text-[16px]"
      role="group"
      aria-label={t("viewLabel")}
    >
      {DASHBOARD_VIEWS.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className="px-2.5 py-1 font-medium"
          style={
            view === v
              ? { background: "var(--accent)", color: "#ffffff" }
              : { color: "var(--text-secondary)" }
          }
        >
          {t(`view_${v}`)}
        </button>
      ))}
    </div>
  );
}

const MAX_UNDO = 50;

type Snapshot = { projects: Project[]; categories: TaskCategory[] };

async function fetchSnapshot(): Promise<Snapshot> {
  const [projects, categories] = await Promise.all(
    ["/api/projects", "/api/task-categories"].map(async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    })
  );
  return { projects, categories };
}

async function fetchOutbox(signal?: AbortSignal): Promise<Outbox | null> {
  const res = await fetch("/api/notifications", { signal });
  return res.ok ? res.json() : null;
}

/** Ctrl+Z in a text box belongs to the box. Checkboxes and selects hold no text. */
function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement)
    return !["checkbox", "radio", "button"].includes(target.type);
  return target instanceof HTMLTextAreaElement || target.isContentEditable;
}

export default function Dashboard() {
  const { t, lang } = useLang();
  const { view, setView } = useDashboardView();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  // Staff names, offered in the assignee pickers so that a task is given to a
  // spelling the mail notifications can match.
  const [directory, setDirectory] = useState<string[]>([]);
  const [outbox, setOutbox] = useState<Outbox | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<
    "closed" | "create" | "edit" | "contract" | "export" | "categories" | "outbox"
  >("closed");
  const [editTask, setEditTask] = useState<Task | null>(null);
  // One project filter behind the stat tiles, the timeline, both overview panels
  // and the calendar, so narrowing any one narrows the others. Empty means "all
  // projects".
  const [filterPicked, setFilterPicked] = useState<Set<number>>(
    () => new Set()
  );
  // Finished projects are hidden from the timeline unless asked for.
  const [showPast, setShowPast] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [undoNotice, setUndoNotice] = useState<string | null>(null);
  const [canStep, setCanStep] = useState({ undo: false, redo: false });
  // Null is a guest, which is also what the page shows until this is known.
  const [pmEmail, setPmEmail] = useState<string | null>(null);
  const canEdit = pmEmail !== null;

  const loadSession = useCallback(
    () =>
      fetch("/api/auth/me")
        .then((res) => (res.ok ? res.json() : { email: null }))
        .then((data) => setPmEmail(data.email))
        .catch(() => setPmEmail(null)),
    []
  );

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("signin");
    loadSession().then(() => {
      if (!outcome) return;
      window.history.replaceState(null, "", "/");
      setUndoNotice(
        t(outcome === "denied" ? "signInDenied" : "signInFailed")
      );
    });
  }, [loadSession, t]);

  // A session can run out mid-edit. Dropping to the guest view shows why the save
  // failed and offers the way back in.
  useEffect(() => {
    if (saveFailed) loadSession();
  }, [saveFailed, loadSession]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await loadSession();
  }

  useEffect(() => {
    fetch("/api/people")
      .then((res) => (res.ok ? res.json() : []))
      .then(setDirectory)
      .catch(() => {}); // the pickers still offer the names already in use
  }, []);

  // Every save ends in a re-read of the projects, so this follows the edits.
  useEffect(() => {
    const controller = new AbortController();
    fetchOutbox(controller.signal)
      .then((next) => next && setOutbox(next))
      .catch(() => {}); // aborted, or the button just keeps its last count
    return () => controller.abort();
  }, [projects]);

  // Saves and undos run strictly one at a time. Ctrl+Z straight after a drop has
  // to wait for that save, or there would be nothing yet to undo, and the reads
  // either side of a save must not pick up another save's changes.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useRef(0);
  const history = useRef<{ undo: RowChange[][]; redo: RowChange[][] }>({
    undo: [],
    redo: [],
  });

  const enqueue = useCallback(<T,>(job: () => Promise<T>) => {
    queued.current++;
    const run = queue.current.then(job).finally(() => {
      queued.current--;
    });
    queue.current = run.catch(() => {});
    return run;
  }, []);

  // While more work is queued its optimistic update is on screen, so a result
  // from before that work must not replace it.
  const showResult = useCallback((data: Snapshot) => {
    if (queued.current === 1) {
      setProjects(data.projects);
      setCategories(data.categories);
    }
  }, []);

  const publishHistory = useCallback(() => {
    setCanStep({
      undo: history.current.undo.length > 0,
      redo: history.current.redo.length > 0,
    });
  }, []);

  // Both reads come from the server rather than local state, which can be hours
  // old: a colleague's earlier change must not count as part of this edit.
  const track: TrackEdit = useCallback(
    (save) =>
      enqueue(async () => {
        const before = await fetchSnapshot();
        const result = await save();
        const after = await fetchSnapshot();
        const changes = [
          ...diffCategories(before.categories, after.categories),
          ...diffProjects(before.projects, after.projects),
        ];
        if (changes.length > 0) {
          const { undo } = history.current;
          undo.push(changes);
          if (undo.length > MAX_UNDO) undo.shift();
          history.current.redo = [];
          publishHistory();
        }
        showResult(after);
        return result;
      }),
    [enqueue, publishHistory, showResult]
  );

  const step = useCallback(
    (direction: "undo" | "redo") =>
      enqueue(async () => {
        const stack = history.current[direction];
        const edit = stack[stack.length - 1];
        if (!edit) return;
        try {
          const res = await fetch("/api/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: direction === "undo" ? reversed(edit) : edit,
            }),
          });
          if (!res.ok) throw new Error(res.statusText);
          const { restored, skipped } = await res.json();
          stack.pop();
          if (restored > 0)
            history.current[direction === "undo" ? "redo" : "undo"].push(edit);
          publishHistory();
          showResult(await fetchSnapshot());
          const done = t(direction === "undo" ? "undone" : "redone", {
            name: changeLabel(edit) ?? t("projectOrder"),
          });
          const left = t("undoSkipped", { n: String(skipped) });
          setSaveFailed(false);
          setUndoNotice(
            skipped === 0 ? done : restored > 0 ? `${done} ${left}` : left
          );
        } catch {
          setSaveFailed(true);
        }
      }),
    [enqueue, publishHistory, showResult, t]
  );

  const refresh = useCallback(async () => {
    const data = await fetchSnapshot();
    setProjects(data.projects);
    setCategories(data.categories);
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
      await track(() =>
        fetch("/api/projects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: orderedIds }),
        })
      );
    },
    [projects, track]
  );

  // Drag results and status changes are optimistic for the same reason as
  // reorder: a dropped item must not jump back while the request is out. A failed
  // save restores what was on screen and says so.
  const commit = useCallback(
    async (
      id: number,
      change: (p: Project) => Project,
      path: string,
      method: string,
      body: unknown
    ) => {
      const before = projects;
      setSaveFailed(false);
      setProjects(
        (cur) => cur && cur.map((p) => (p.id === id ? change(p) : p))
      );
      try {
        // track's re-read picks up the linked side of a task/deliverable pair
        await track(async () => {
          const res = await fetch(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(res.statusText);
        });
      } catch {
        setProjects(before);
        setSaveFailed(true);
      }
    },
    [projects, track]
  );

  const patchTask = useCallback(
    (task: Task, fields: Partial<Task>) =>
      commit(
        task.project_id,
        (p) => withTaskChange(p, task.id, fields),
        `/api/tasks/${task.id}`,
        "PATCH",
        fields
      ),
    [commit]
  );

  const moveTaskDeadline = useCallback(
    (task: Task, date: string) => patchTask(task, withDeadline(task, date)),
    [patchTask]
  );

  const moveDeliverable = useCallback(
    (milestone: Milestone, date: string) => {
      const project = projects?.find((p) => p.id === milestone.project_id);
      const linked = project && taskOf(project, milestone);
      if (linked) return moveTaskDeadline(linked, date);
      return commit(
        milestone.project_id,
        (p) => withDeliverableDate(p, milestone, date),
        `/api/milestones/${milestone.id}`,
        "PATCH",
        { due_date: date }
      );
    },
    [projects, moveTaskDeadline, commit]
  );

  const setDeliverableDone = useCallback(
    (milestone: Milestone, done: boolean) =>
      commit(
        milestone.project_id,
        (p) => ({
          ...p,
          milestones: p.milestones.map((m) =>
            m.id === milestone.id ? { ...m, done: done ? 1 : 0 } : m
          ),
        }),
        `/api/milestones/${milestone.id}`,
        "PATCH",
        { done }
      ),
    [commit]
  );

  const resizeProject = useCallback(
    (project: Project, start_date: string, end_date: string) =>
      commit(
        project.id,
        (p) => ({ ...p, start_date, end_date }),
        `/api/projects/${project.id}`,
        "PATCH",
        { start_date, end_date }
      ),
    [commit]
  );

  // The one drag that rewrites many rows at once, so it asks first whenever it
  // would carry open work along.
  const moveProject = useCallback(
    (project: Project, days: number) => {
      const open =
        project.tasks.filter((x) => x.status !== "done").length +
        project.milestones.filter((m) => !m.done).length;
      if (
        open > 0 &&
        !confirm(
          t("confirmShift", {
            name: project.name,
            days: days > 0 ? `+${days}` : String(days),
            n: String(open),
          })
        )
      )
        return;
      return commit(
        project.id,
        (p) => shiftedProject(p, days),
        `/api/projects/${project.id}/shift`,
        "POST",
        { days }
      );
    },
    [commit, t]
  );

  const moveTask = useCallback(
    (task: Task, status: TaskStatus) => patchTask(task, { status }),
    [patchTask]
  );

  const reassignTask = useCallback(
    (task: Task, assignee: string) => patchTask(task, { assignee }),
    [patchTask]
  );

  // The non-Gantt views can be taller than the screen, so opening a project
  // from one of them has to bring its panel into view.
  const openProject = useCallback((id: number) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      document.getElementById(PANEL_IDS.project)?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    });
  }, []);

  // Physical keys, not letters: on a Georgian layout the Z key reports "ზ".
  const dialogOpen = modal !== "closed" || editTask !== null;
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const redo = e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey);
      if (!redo && e.code !== "KeyZ") return;
      if (dialogOpen || isTextEntry(e.target)) return;
      e.preventDefault();
      step(redo ? "redo" : "undo");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, step]);

  useEffect(() => {
    if (!undoNotice) return;
    const timer = setTimeout(() => setUndoNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [undoNotice]);

  // keep <html lang> in sync (useUiLang and screen readers rely on it)
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    fetchSnapshot().then((data) => {
      if (cancelled) return;
      setProjects(data.projects);
      setCategories(data.categories);
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
  // Unlike the timeline, the tiles ignore "show past": it only decides what the
  // chart draws, and their overdue and deliverable counts cover finished projects.
  const tileProjects = useMemo(
    () =>
      picked.size > 0
        ? (projects ?? []).filter((p) => picked.has(p.id))
        : (projects ?? []),
    [projects, picked]
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
    for (const name of directory) set.add(name);
    return [...set].sort();
  }, [projects, directory]);

  if (projects === null) {
    return <p className="p-8 text-sm text-ink-3">{t("loading")}</p>;
  }

  return (
    <CanEditContext.Provider value={canEdit}>
    <div className="mx-auto w-full max-w-[100rem] space-y-4 p-4 sm:p-6">
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
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <div className="flex gap-1" role="group">
              <button
                className="btn disabled:opacity-40"
                disabled={!canStep.undo}
                onClick={() => step("undo")}
                aria-label={t("undo")}
                title={`${t("undo")} (Ctrl+Z)`}
              >
                ↶
              </button>
              <button
                className="btn disabled:opacity-40"
                disabled={!canStep.redo}
                onClick={() => step("redo")}
                aria-label={t("redo")}
                title={`${t("redo")} (Ctrl+Y)`}
              >
                ↷
              </button>
            </div>
          )}
          <ThemeToggle />
          <LangToggle />
          {canEdit && outbox && outbox.items.length > 0 && (
            <button className="btn" onClick={() => setModal("outbox")}>
              {t("outboxButton", { n: String(outbox.items.length) })}
            </button>
          )}
          {projects.length > 0 && (
            <button className="btn" onClick={() => setModal("export")}>
              {t("export")}
            </button>
          )}
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => setModal("create")}
            >
              {t("newProject")}
            </button>
          )}
          {canEdit ? (
            <button className="btn" title={pmEmail} onClick={signOut}>
              {t("signOut")}
            </button>
          ) : (
            <a className="btn" href="/api/auth/login">
              {t("signIn")}
            </a>
          )}
        </div>
      </header>

      <StatTiles projects={tileProjects} allProjects={projects} />

      {projects.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="text-ink-2">{t("emptyState")}</p>
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => setModal("create")}
            >
              {t("newProject")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            id={PANEL_IDS.gantt}
            className={`card scroll-mt-4 p-4 ${
              view === "gantt" ? "overflow-x-auto" : ""
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <ViewSwitcher view={view} onChange={setView} />
              <ProjectFilter
                projects={projects}
                relevant={timelineRelevant}
                value={picked}
                onChange={setFilterPicked}
              />
              {hasPast && (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-[16px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={showPast}
                    onChange={(e) => setShowPast(e.target.checked)}
                  />
                  {t("showPastProjects")}
                </label>
              )}
              {canEdit && view !== "gantt" && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    className="btn"
                    onClick={() => setModal("categories")}
                  >
                    {t("categories")}
                  </button>
                  <AddCategory onAdded={refresh} />
                </div>
              )}
            </div>
            {timelineProjects.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-3">
                {t("noActiveProjects")}
              </p>
            )}
            {view === "gantt" && (
              <Gantt
                projects={timelineProjects}
                selectedId={selectedId}
                onSelect={(id) =>
                  setSelectedId((cur) => (cur === id ? null : id))
                }
                onReorder={reorder}
                onMoveProject={moveProject}
                onResizeProject={resizeProject}
                onChangeTask={patchTask}
                categories={categories}
                onMoveDeliverable={moveDeliverable}
              />
            )}
            {timelineProjects.length > 0 && view === "board" && (
              <BoardView
                projects={timelineProjects}
                categories={categories}
                onMoveTask={moveTask}
                onSelect={openProject}
                onEditTask={setEditTask}
              />
            )}
            {timelineProjects.length > 0 && view === "list" && (
              <ListView
                projects={timelineProjects}
                categories={categories}
                onMoveTask={moveTask}
                onSetDeliverableDone={setDeliverableDone}
                onSelect={openProject}
                onEditTask={setEditTask}
              />
            )}
          </div>

          {selected ? (
            <div id={PANEL_IDS.project} className="scroll-mt-4">
              <ProjectPanel
                project={selected}
                people={people}
                onChanged={refresh}
                track={track}
                categories={categories}
                onEditTask={setEditTask}
                onEdit={() => setModal("edit")}
                onDeleted={() => {
                  setSelectedId(null);
                  refresh();
                }}
              />
            </div>
          ) : (
            view === "gantt" && (
              <p className="px-1 text-sm text-ink-3">
                {t(canEdit ? "hint" : "hintGuest")}
              </p>
            )
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkOverview
              projects={projects}
              filterIds={picked}
              onFilter={setFilterPicked}
              onSelect={(id) => setSelectedId(id)}
              onEditTask={setEditTask}
              onReassign={reassignTask}
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
          <CalendarView
            projects={projects}
            filterIds={picked}
            onFilter={setFilterPicked}
            onSelect={openProject}
            onEditTask={setEditTask}
            onMoveTask={moveTaskDeadline}
            onMoveDeliverable={moveDeliverable}
          />
        </>
      )}

      {undoNotice && !saveFailed && (
        <div
          role="status"
          className="card fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 px-4 py-2 text-sm shadow-lg"
        >
          {undoNotice}
          <button
            type="button"
            className="text-ink-3 hover:text-ink"
            aria-label={t("dismiss")}
            onClick={() => setUndoNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      {saveFailed && (
        <div
          role="alert"
          className="card fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 px-4 py-2 text-sm text-[var(--status-critical)] shadow-lg"
        >
          {t("errSave")}
          <button
            type="button"
            className="text-ink-3 hover:text-ink"
            aria-label={t("dismiss")}
            onClick={() => setSaveFailed(false)}
          >
            ✕
          </button>
        </div>
      )}

      {editTask && (
        <TaskFormModal
          task={editTask}
          people={people}
          categories={categories}
          track={track}
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
          categories={categories}
          onClose={() => setModal("closed")}
        />
      )}

      {modal === "outbox" && outbox && (
        <OutboxModal
          outbox={outbox}
          onChanged={async () => {
            const next = await fetchOutbox();
            if (next) setOutbox(next);
          }}
          onClose={() => setModal("closed")}
        />
      )}

      {modal === "categories" && (
        <CategoryModal
          categories={categories}
          projects={projects}
          track={track}
          onChanged={refresh}
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
          track={track}
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
    </CanEditContext.Provider>
  );
}
