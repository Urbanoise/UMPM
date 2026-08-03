"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { normalizeAssignees } from "@/lib/assignees";
import ComboBox from "./ComboBox";

// Applies one start date, end date and/or assignee to every selected task.
// Each field has its own "change this" tick: untouched fields are left alone on
// every task, while a ticked-but-empty field clears the value.
export default function BulkTaskModal({
  tasks,
  people,
  onClose,
  onSaved,
}: {
  tasks: Task[];
  people: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [applyStart, setApplyStart] = useState(false);
  const [applyEnd, setApplyEnd] = useState(false);
  const [applyAssignee, setApplyAssignee] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bothDatesClash =
    applyStart && applyEnd && !!startDate && !!endDate && endDate < startDate;

  // Changing only one of the two dates can still invert an individual task's
  // pair, which is worth warning about but not worth blocking.
  const inverted = bothDatesClash
    ? 0
    : tasks.filter((task) => {
        const s = applyStart ? startDate || null : task.start_date;
        const e = applyEnd ? endDate || null : task.end_date;
        return s && e && e < s;
      }).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!applyStart && !applyEnd && !applyAssignee) {
      setError(t("errBulkNoField"));
      return;
    }
    if (bothDatesClash) {
      setError(t("errDates"));
      return;
    }
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: tasks.map((task) => task.id),
        ...(applyStart ? { start_date: startDate } : {}),
        ...(applyEnd ? { end_date: endDate } : {}),
        ...(applyAssignee ? { assignee: normalizeAssignees(assignee) } : {}),
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
        <h2 className="text-lg font-semibold">{t("formTitleBulkEdit")}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {t("nSelected", { n: String(tasks.length) })}
        </p>
        <ul className="mt-2 max-h-24 overflow-y-auto text-[13px] text-ink-3">
          {tasks.map((task) => (
            <li key={task.id} className="truncate">
              {task.name}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] text-ink-2">{t("bulkHint")}</p>

        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <input
              id="bulk-start"
              type="checkbox"
              checked={applyStart}
              onChange={(e) => {
                setError(null);
                setApplyStart(e.target.checked);
              }}
            />
            <label htmlFor="bulk-start" className="w-40 text-sm text-ink-2">
              {t("taskStart")}
            </label>
            <input
              type="date"
              className="flex-1 text-sm"
              aria-label={t("taskStart")}
              disabled={!applyStart}
              value={startDate}
              onChange={(e) => {
                setError(null);
                setStartDate(e.target.value);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="bulk-end"
              type="checkbox"
              checked={applyEnd}
              onChange={(e) => {
                setError(null);
                setApplyEnd(e.target.checked);
              }}
            />
            <label htmlFor="bulk-end" className="w-40 text-sm text-ink-2">
              {t("taskEnd")}
            </label>
            <input
              type="date"
              className="flex-1 text-sm"
              aria-label={t("taskEnd")}
              disabled={!applyEnd}
              value={endDate}
              onChange={(e) => {
                setError(null);
                setEndDate(e.target.value);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="bulk-assignee"
              type="checkbox"
              checked={applyAssignee}
              onChange={(e) => {
                setError(null);
                setApplyAssignee(e.target.checked);
              }}
            />
            <label htmlFor="bulk-assignee" className="w-40 text-sm text-ink-2">
              {t("assignee")}
            </label>
            <div className={`flex-1 ${applyAssignee ? "" : "opacity-50"}`}>
              <ComboBox
                multi
                placeholder={t("assignee")}
                value={assignee}
                onChange={(v) => {
                  // typing or picking a name implies the intent to change it
                  setError(null);
                  setApplyAssignee(true);
                  setAssignee(v);
                }}
                options={people}
              />
            </div>
          </div>
        </div>

        {inverted > 0 && (
          <p className="mt-3 text-sm text-[var(--status-serious)]">
            ⚠ {t("warnInverted", { n: String(inverted) })}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving
              ? t("saving")
              : t("bulkApply", { n: String(tasks.length) })}
          </button>
        </div>
      </form>
    </div>
  );
}
