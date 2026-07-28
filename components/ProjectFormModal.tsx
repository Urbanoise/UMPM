"use client";

import { useState } from "react";
import type { Project, ProjectStatus } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";
import { todayStr } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

export default function ProjectFormModal({
  initial,
  people,
  onClose,
  onSaved,
}: {
  initial: Project | null;
  people: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayStr());
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? "planned");
  const [responsible, setResponsible] = useState(initial?.responsible ?? "");
  const [tentative, setTentative] = useState<boolean>(!!initial?.tentative);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !startDate || !endDate) {
      setError(t("errRequired"));
      return;
    }
    if (endDate < startDate) {
      setError(t("errDates"));
      return;
    }
    setSaving(true);
    const payload = {
      name,
      description,
      start_date: startDate,
      end_date: endDate,
      status,
      responsible,
      tentative,
    };
    const res = initial
      ? await fetch(`/api/projects/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
        <h2 className="text-lg font-semibold">
          {initial ? t("formTitleEdit") : t("formTitleNew")}
        </h2>

        <label className="mt-4 block text-sm">
          <span className="text-ink-2">{t("fieldName")}</span>
          <input
            className="mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-ink-2">{t("fieldDescription")}</span>
          <textarea
            className="mt-1 w-full"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-2">{t("fieldStart")}</span>
            <input
              type="date"
              className="mt-1 w-full"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-2">{t("fieldEnd")}</span>
            <input
              type="date"
              className="mt-1 w-full"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={tentative}
            onChange={(e) => setTentative(e.target.checked)}
          />
          <span>
            <span className="text-ink">{t("fieldTentative")}</span>
            <span className="mt-0.5 block text-xs text-ink-2">
              {t("fieldTentativeHint")}
            </span>
          </span>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-2">{t("fieldStatus")}</span>
            <select
              className="mt-1 w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink-2">{t("fieldResponsible")}</span>
            <input
              className="mt-1 w-full"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              list="people-list"
            />
          </label>
        </div>

        <datalist id="people-list">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        {error && (
          <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t("saving") : initial ? t("saveChanges") : t("createProject")}
          </button>
        </div>
      </form>
    </div>
  );
}
