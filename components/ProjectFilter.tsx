"use client";

import type { Project } from "@/lib/types";
import { useLang } from "@/lib/i18n";

/**
 * The project filter shared by the two overview panels. Dashboard owns the
 * value, so picking a project in one panel narrows the other as well; each
 * panel passes the ids it can actually show as `relevant` so its own dropdown
 * never offers an option that filters down to nothing there.
 */
export default function ProjectFilter({
  projects,
  relevant,
  value,
  onChange,
}: {
  projects: Project[];
  relevant: Set<number>;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { t } = useLang();
  // The picked project stays listed even when this panel has nothing for it —
  // otherwise the control would show a filter the user cannot see or clear.
  const options = projects.filter((p) => relevant.has(p.id) || p.id === value);
  if (options.length < 2 && value === null) return null;

  return (
    <select
      className="max-w-40 px-1.5 py-0.5 text-[12px]"
      value={value ?? ""}
      aria-label={t("filterByProject")}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
    >
      <option value="">{t("allProjects")}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
