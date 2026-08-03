"use client";

import { useState } from "react";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { TASK_STATUSES } from "@/lib/types";
import { TASK_NAME_PRESETS } from "@/lib/presets";
import { fmtDate, todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";
import { normalizeAssignees } from "@/lib/assignees";
import ComboBox from "./ComboBox";
import BulkTaskModal from "./BulkTaskModal";

// Shared empty selection, so "nothing selected" keeps a stable identity.
const EMPTY_IDS: Set<number> = new Set();

const STATUS_META: Record<string, { icon: string; color: string }> = {
  planned: { icon: "○", color: "var(--text-muted)" },
  active: { icon: "●", color: "var(--status-good)" },
  "on-hold": { icon: "◐", color: "var(--status-serious)" },
  done: { icon: "✓", color: "var(--status-good)" },
};

async function api(path: string, method: string, body?: unknown) {
  await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default function ProjectPanel({
  project,
  people,
  onChanged,
  onEdit,
  onEditTask,
  onDeleted,
}: {
  project: Project;
  people: string[];
  onChanged: () => void;
  onEdit: () => void;
  onEditTask: (task: Task) => void;
  onDeleted: () => void;
}) {
  const { t, lang, locale } = useLang();
  const today = todayStr();
  const p = project;
  const doneTasks = p.tasks.filter((task) => task.status === "done").length;
  const progress = p.tasks.length ? doneTasks / p.tasks.length : null;
  const meta = STATUS_META[p.status] ?? STATUS_META.planned;

  // add-milestone form
  const [msName, setMsName] = useState("");
  const [msDate, setMsDate] = useState("");
  // add-task form
  const [tName, setTName] = useState("");
  const [tAssignee, setTAssignee] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  // Bulk task selection. The panel is reused when another project is picked,
  // so the selection carries the project it belongs to and is read as empty
  // once that no longer matches — no reset effect needed.
  const [sel, setSel] = useState<{
    projectId: number;
    ids: Set<number>;
    bulkOpen: boolean;
  }>({ projectId: p.id, ids: EMPTY_IDS, bulkOpen: false });
  const current = sel.projectId === p.id ? sel : null;
  const selectedIds = current?.ids ?? EMPTY_IDS;
  const bulkOpen = current?.bulkOpen ?? false;

  function setSelection(ids: Set<number>, bulkOpen = false) {
    setSel({ projectId: p.id, ids, bulkOpen });
  }

  // outcome of the last copy-to-deliverables run, shown next to the button
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState<string | null>(null);

  async function copyToDeliverables(ids: number[]) {
    setCopying(true);
    setCopyResult(null);
    const res = await fetch("/api/tasks/copy-to-deliverables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setCopying(false);
    if (!res.ok) {
      setCopyResult(t("errSave"));
      return;
    }
    const { created, skipped } = await res.json();
    setCopyResult(
      t("copyResult", { created: String(created), skipped: String(skipped) })
    );
    setSelection(EMPTY_IDS);
    onChanged();
  }

  // Ignore ids of tasks that have since been deleted elsewhere.
  const selectedTasks = p.tasks.filter((task) => selectedIds.has(task.id));
  const allSelected =
    p.tasks.length > 0 && selectedTasks.length === p.tasks.length;

  function toggleTask(id: number, on: boolean) {
    const next = new Set(selectedIds);
    if (on) next.add(id);
    else next.delete(id);
    setSelection(next, bulkOpen);
  }

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!msName.trim() || !msDate) return;
    await api(`/api/projects/${p.id}/milestones`, "POST", {
      name: msName,
      due_date: msDate,
    });
    setMsName("");
    setMsDate("");
    onChanged();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!tName.trim()) return;
    await api(`/api/projects/${p.id}/tasks`, "POST", {
      name: tName,
      assignee: normalizeAssignees(tAssignee),
      start_date: tStart,
      end_date: tEnd,
    });
    setTName("");
    setTAssignee("");
    setTStart("");
    setTEnd("");
    onChanged();
  }

  async function deleteProject() {
    if (!confirm(t("confirmDelete", { name: p.name }))) return;
    await api(`/api/projects/${p.id}`, "DELETE");
    onDeleted();
  }

  return (
    <div className="card p-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{p.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <span>
              <span style={{ color: meta.color }}>{meta.icon}</span>{" "}
              <span>{t(`status_${p.status}`)}</span>
            </span>
            <span>
              {fmtDate(p.start_date, locale)} → {fmtDate(p.end_date, locale)}
            </span>
            {p.responsible && (
              <span>
                {t("responsiblePrefix")} {p.responsible}
              </span>
            )}
          </div>
          {p.description && (
            <p className="mt-2 max-w-2xl text-sm text-ink-2">{p.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={onEdit}>
            {t("edit")}
          </button>
          <button className="btn btn-danger" onClick={deleteProject}>
            {t("delete")}
          </button>
        </div>
      </div>

      {/* progress meter */}
      {progress !== null && (
        <div className="mt-4 max-w-md">
          <div className="flex justify-between text-[13px] text-ink-2">
            <span>{t("taskProgress")}</span>
            <span className="font-medium text-ink">
              {doneTasks}/{p.tasks.length} {t("doneWord")}
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full"
            style={{ background: "var(--meter-track)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* milestones */}
        <section>
          <h3 className="text-sm font-semibold tracking-wide text-ink-2">
            {t("milestones")}
          </h3>
          <ul className="mt-2 space-y-1">
            {p.milestones.map((m) => {
              const overdue = !m.done && m.due_date < today;
              return (
                <li
                  key={m.id}
                  className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--gridline)]/40"
                >
                  <input
                    type="checkbox"
                    checked={!!m.done}
                    onChange={async (e) => {
                      await api(`/api/milestones/${m.id}`, "PATCH", {
                        done: e.target.checked,
                      });
                      onChanged();
                    }}
                    aria-label={`${t("markDone")} ${m.name}`}
                  />
                  <span
                    className={`flex-1 text-sm ${m.done ? "text-ink-3 line-through" : ""}`}
                  >
                    {m.name}
                  </span>
                  <span
                    className={`text-[13px] ${
                      overdue
                        ? "font-medium text-[var(--status-critical)]"
                        : "text-ink-2"
                    }`}
                  >
                    {overdue && "⚠ "}
                    {fmtDate(m.due_date, locale)}
                  </span>
                  <button
                    className="invisible text-ink-3 hover:text-[var(--status-critical)] group-hover:visible"
                    aria-label={`${t("deleteMilestone")} ${m.name}`}
                    onClick={async () => {
                      await api(`/api/milestones/${m.id}`, "DELETE");
                      onChanged();
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
            {p.milestones.length === 0 && (
              <li className="px-2 py-1 text-sm text-ink-3">
                {t("noMilestones")}
              </li>
            )}
          </ul>
          <form onSubmit={addMilestone} className="mt-2 flex gap-2">
            <input
              className="flex-1 text-sm"
              placeholder={t("newMilestone")}
              value={msName}
              onChange={(e) => setMsName(e.target.value)}
            />
            <input
              type="date"
              className="text-sm"
              value={msDate}
              onChange={(e) => setMsDate(e.target.value)}
            />
            <button className="btn" type="submit">
              {t("add")}
            </button>
          </form>
        </section>

        {/* tasks */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-ink-2">
              {t("tasks")}
            </h3>
            {p.tasks.length > 0 && (
              <label className="flex items-center gap-2 text-[13px] text-ink-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelection(
                      e.target.checked
                        ? new Set(p.tasks.map((task) => task.id))
                        : EMPTY_IDS,
                      bulkOpen
                    )
                  }
                />
                {t("selectAllTasks")}
              </label>
            )}
          </div>

          {selectedTasks.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-edge px-2 py-1.5">
              <span className="text-[13px] font-medium">
                {t("nSelected", { n: String(selectedTasks.length) })}
              </span>
              <button
                type="button"
                className="btn ml-auto py-1 text-[13px]"
                disabled={copying}
                onClick={() =>
                  copyToDeliverables(selectedTasks.map((task) => task.id))
                }
              >
                {copying ? t("copying") : t("copyToDeliverables")}
              </button>
              <button
                type="button"
                className="btn btn-primary py-1 text-[13px]"
                onClick={() => setSelection(selectedIds, true)}
              >
                {t("bulkEdit")}
              </button>
              <button
                type="button"
                className="btn py-1 text-[13px]"
                onClick={() => setSelection(EMPTY_IDS)}
              >
                {t("clearSelection")}
              </button>
            </div>
          )}

          {copyResult && (
            <p className="mt-2 px-2 text-[13px] text-ink-2">{copyResult}</p>
          )}

          <ul className="mt-2 space-y-1">
            {p.tasks.map((task) => {
              const overdue =
                task.status !== "done" && task.end_date && task.end_date < today;
              return (
                <li
                  key={task.id}
                  className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--gridline)]/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(task.id)}
                    aria-label={`${t("selectTask")} ${task.name}`}
                    onChange={(e) => toggleTask(task.id, e.target.checked)}
                  />
                  <select
                    className="px-1.5 py-0.5 text-[12px]"
                    value={task.status}
                    aria-label={`${t("statusOf")} ${task.name}`}
                    onChange={async (e) => {
                      await api(`/api/tasks/${task.id}`, "PATCH", {
                        status: e.target.value as TaskStatus,
                      });
                      onChanged();
                    }}
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`tstatus_${s}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`flex-1 cursor-pointer text-left text-sm hover:underline ${
                      task.status === "done" ? "text-ink-3 line-through" : ""
                    }`}
                    aria-label={`${t("edit")}: ${task.name}`}
                    onClick={() => onEditTask(task)}
                  >
                    {task.name}
                  </button>
                  {task.assignee && (
                    <span className="text-[13px] text-ink-2">
                      {task.assignee}
                    </span>
                  )}
                  {(task.start_date || task.end_date) && (
                    <span
                      className={`text-[13px] ${
                        overdue
                          ? "font-medium text-[var(--status-critical)]"
                          : "text-ink-3"
                      }`}
                    >
                      {overdue && "⚠ "}
                      {task.start_date
                        ? fmtDate(task.start_date, locale)
                        : "…"}{" "}
                      – {task.end_date ? fmtDate(task.end_date, locale) : "…"}
                    </span>
                  )}
                  <button
                    className="invisible text-ink-3 hover:text-[var(--status-critical)] group-hover:visible"
                    aria-label={`${t("deleteTask")} ${task.name}`}
                    onClick={async () => {
                      await api(`/api/tasks/${task.id}`, "DELETE");
                      onChanged();
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
            {p.tasks.length === 0 && (
              <li className="px-2 py-1 text-sm text-ink-3">{t("noTasks")}</li>
            )}
          </ul>
          <form onSubmit={addTask} className="mt-2 grid grid-cols-2 gap-2">
            {/* preset values follow the UI language */}
            <ComboBox
              className="w-full"
              placeholder={t("newTask")}
              value={tName}
              onChange={setTName}
              options={TASK_NAME_PRESETS.map((preset) =>
                lang === "ka" ? preset.ge : preset.en
              )}
            />
            <ComboBox
              multi
              className="w-full"
              placeholder={t("assignee")}
              value={tAssignee}
              onChange={setTAssignee}
              options={people}
            />
            <input
              type="date"
              className="text-sm"
              aria-label={t("taskStart")}
              value={tStart}
              onChange={(e) => setTStart(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                type="date"
                className="w-full text-sm"
                aria-label={t("taskEnd")}
                value={tEnd}
                onChange={(e) => setTEnd(e.target.value)}
              />
              <button className="btn" type="submit">
                {t("add")}
              </button>
            </div>
          </form>
        </section>
      </div>

      {bulkOpen && selectedTasks.length > 0 && (
        <BulkTaskModal
          tasks={selectedTasks}
          people={people}
          onClose={() => setSelection(selectedIds)}
          onSaved={() => {
            setSelection(EMPTY_IDS);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
