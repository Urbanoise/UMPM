"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { isBuiltinStatusName } from "@/lib/taskStatus";

const NAME_MAX = 40;

/** The name field behind both the toolbar button and the Categories dialog. */
export function AddCategoryForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (isBuiltinStatusName(next, t)) {
      setError(t("errCategoryExists"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/task-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (res.status === 400) {
        setError(t("errCategoryExists"));
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      setName("");
      onAdded();
    } catch {
      setError(t("errSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={add} className="flex gap-2">
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
        <p role="alert" className="mt-2 text-sm text-[var(--status-critical)]">
          {error}
        </p>
      )}
    </>
  );
}

/** Adds a category from the Board and List toolbar, without opening the dialog. */
export default function AddCategory({ onAdded }: { onAdded: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        + {t("addCategoryButton")}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-[26rem] max-w-[calc(100vw-3rem)] rounded-lg border border-edge bg-surface p-3 shadow-lg">
          <AddCategoryForm
            onAdded={() => {
              setOpen(false);
              onAdded();
            }}
          />
        </div>
      )}
    </div>
  );
}
