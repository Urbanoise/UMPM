"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import {
  buildPdf,
  buildXlsx,
  downloadBlob,
  exportFileName,
  type ExportAudience,
} from "@/lib/exportGantt";

function seriesVar(slot: number) {
  return `var(--series-${((slot % 8) + 8) % 8})`;
}

// Picks which projects go into a Gantt export and in which format. Starts with
// the project open on the dashboard if there is one, otherwise with all of them.
export default function ExportModal({
  projects,
  initialId,
  onClose,
}: {
  projects: Project[];
  initialId: number | null;
  onClose: () => void;
}) {
  const { t, locale } = useLang();
  const [picked, setPicked] = useState<Set<number>>(
    () =>
      new Set(initialId !== null ? [initialId] : projects.map((p) => p.id))
  );
  const [includeTasks, setIncludeTasks] = useState(true);
  const [audience, setAudience] = useState<ExportAudience>("client");
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number) {
    setError(null);
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(format: "xlsx" | "pdf") {
    // keep the dashboard's (user-arranged) project order
    const chosen = projects.filter((p) => picked.has(p.id));
    if (chosen.length === 0) {
      setError(t("errExportNone"));
      return;
    }
    setError(null);
    setBusy(format);
    try {
      const opts = { includeTasks, audience, t, locale };
      const blob =
        format === "xlsx"
          ? await buildXlsx(chosen, opts)
          : await buildPdf(chosen, opts);
      downloadBlob(blob, exportFileName(chosen, format));
      onClose();
    } catch (err) {
      console.error(err);
      setError(t("errExport"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-lg p-6 shadow-xl"
        role="dialog"
        aria-labelledby="export-title"
      >
        <h2 id="export-title" className="text-lg font-semibold">
          {t("exportTitle")}
        </h2>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-ink-2">
            {t("statProjects")} ({picked.size}/{projects.length})
          </span>
          <div className="flex gap-3 text-[13px]">
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => {
                setError(null);
                setPicked(new Set(projects.map((p) => p.id)));
              }}
            >
              {t("exportSelectAll")}
            </button>
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => setPicked(new Set())}
            >
              {t("exportSelectNone")}
            </button>
          </div>
        </div>

        <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-edge p-2">
          {projects.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--gridline)]">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    background:
                      p.status === "done"
                        ? "var(--baseline)"
                        : seriesVar(p.color_slot),
                  }}
                  aria-hidden
                />
                <span
                  className={`truncate ${p.status === "done" ? "text-ink-3" : ""}`}
                >
                  {p.name}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <label className="mt-4 flex items-center gap-2.5 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={includeTasks}
            onChange={(e) => setIncludeTasks(e.target.checked)}
          />
          {t("exportIncludeTasks")}
        </label>

        <fieldset className="mt-4">
          <legend className="text-sm text-ink-2">{t("exportAudience")}</legend>
          <div className="mt-1.5 flex gap-5 text-sm">
            {(["client", "internal"] as const).map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="export-audience"
                  checked={audience === a}
                  onChange={() => setAudience(a)}
                />
                {t(a === "client" ? "exportForClient" : "exportInternal")}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {t(audience === "client" ? "exportForClientHint" : "exportInternalHint")}
          </p>
        </fieldset>

        {error && (
          <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => run("xlsx")}
          >
            {busy === "xlsx" ? t("exportWorking") : "Excel (XLSX)"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() => run("pdf")}
          >
            {busy === "pdf" ? t("exportWorking") : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
