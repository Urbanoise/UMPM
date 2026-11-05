"use client";

import { useState } from "react";
import type { Project, TaskCategory } from "@/lib/types";
import { TASK_STATUSES, categoryIdOf, categoryStatus } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { statusColor, statusLabel, statusOrder } from "@/lib/taskStatus";
import type { TrackEdit } from "@/lib/undo";

const NAME_MAX = 40;

function send(path: string, method: string, body?: unknown) {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function CategoryRow({
  category,
  onRename,
  onDelete,
}: {
  category: TaskCategory;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(category.name);

  async function save() {
    const next = name.trim();
    if (next === category.name) return;
    // Nothing to keep from a blank or refused name: go back to the saved one.
    if (!next || !(await onRename(next))) setName(category.name);
  }

  return (
    <>
      <input
        className="min-w-0 flex-1"
        value={name}
        maxLength={NAME_MAX}
        aria-label={t("categoryName")}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button type="button" className="btn btn-danger" onClick={onDelete}>
        {t("delete")}
      </button>
    </>
  );
}

export default function CategoryModal({
  categories,
  projects,
  track,
  onChanged,
  onClose,
}: {
  categories: TaskCategory[];
  projects: Project[];
  track: TrackEdit;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The server knows the other custom names; the built-in ones are only
  // translations, so they are checked here, in the language on screen.
  const isBuiltinName = (value: string) =>
    TASK_STATUSES.some(
      (s) => t(`tstatus_${s}`).toLowerCase() === value.toLowerCase()
    );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (isBuiltinName(next)) {
      setError(t("errCategoryExists"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await send("/api/task-categories", "POST", { name: next });
      if (res.status === 400) {
        setError(t("errCategoryExists"));
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      setName("");
      onChanged();
    } catch {
      setError(t("errSave"));
    } finally {
      setSaving(false);
    }
  }

  async function rename(category: TaskCategory, next: string) {
    if (isBuiltinName(next)) {
      setError(t("errCategoryExists"));
      return false;
    }
    setError(null);
    const res = await track(() =>
      send(`/api/task-categories/${category.id}`, "PATCH", { name: next })
    );
    if (!res.ok) {
      setError(t(res.status === 400 ? "errCategoryExists" : "errSave"));
      return false;
    }
    onChanged();
    return true;
  }

  async function remove(category: TaskCategory) {
    const status = categoryStatus(category.id);
    const n = projects
      .flatMap((p) => p.tasks)
      .filter((task) => task.status === status).length;
    if (
      n > 0 &&
      !confirm(
        t("confirmDeleteCategory", { name: category.name, n: String(n) })
      )
    )
      return;
    setError(null);
    const res = await track(() =>
      send(`/api/task-categories/${category.id}`, "DELETE")
    );
    if (!res.ok) {
      setError(t("errSave"));
      return;
    }
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("categories")}
        onClick={(e) => e.stopPropagation()}
        className="card max-h-full w-full max-w-lg overflow-y-auto p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold">{t("categories")}</h2>
        <p className="mt-1 text-sm text-ink-2">{t("categoriesHint")}</p>

        <ul className="mt-4 space-y-2">
          {statusOrder(categories).map((status) => {
            const id = categoryIdOf(status);
            const category = categories.find((c) => c.id === id);
            return (
              <li key={status} className="flex min-h-9 items-center gap-2">
                <Dot color={statusColor(status)} />
                {category ? (
                  // Keyed by name so an undone rename shows up here too.
                  <CategoryRow
                    key={category.name}
                    category={category}
                    onRename={(next) => rename(category, next)}
                    onDelete={() => remove(category)}
                  />
                ) : (
                  <span className="text-ink-2">
                    {statusLabel(status, categories, t)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={add} className="mt-4 flex gap-2">
          <input
            className="min-w-0 flex-1"
            value={name}
            maxLength={NAME_MAX}
            placeholder={t("newCategoryName")}
            aria-label={t("newCategoryName")}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !name.trim()}
          >
            {t("addCategory")}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button type="button" className="btn" onClick={onClose}>
            {t("dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
