"use client";

import { useState } from "react";
import type { Task, TaskStatus } from "@/lib/types";
import { TASK_STATUSES } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { normalizeAssignees } from "@/lib/assignees";
import ComboBox from "./ComboBox";

export default function TaskFormModal({
  task,
  people,
  onClose,
  onSaved,
}: {
  task: Task;
  people: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(task.name);
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [endDate, setEndDate] = useState(task.end_date ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t("errTaskRequired"));
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError(t("errDates"));
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        assignee: normalizeAssignees(assignee),
        start_date: startDate,
        end_date: endDate,
        status,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("errSave"));
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-lg p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold">{t("formTitleEditTask")}</h2>

        <label className="mt-4 block text-sm">
          <span className="text-ink-2">{t("fieldTaskName")}</span>
          <input
            className="mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-2">{t("taskStart")}</span>
            <input
              type="date"
              className="mt-1 w-full"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-2">{t("taskEnd")}</span>
            <input
              type="date"
              className="mt-1 w-full"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-2">{t("fieldStatus")}</span>
            <select
              className="mt-1 w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`tstatus_${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-2">{t("assignee")}</span>
            <ComboBox
              multi
              className="mt-1"
              placeholder={t("assignee")}
              value={assignee}
              onChange={setAssignee}
              options={people}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t("saving") : t("saveChanges")}
          </button>
        </div>
      </form>
    </div>
  );
}
