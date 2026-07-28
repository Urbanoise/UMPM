"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { splitAssignees } from "@/lib/assignees";

// An editable text input (dimmed placeholder when empty) with a ▾ button that
// opens a dropdown of known options. Picking an option fills the input; typing
// a new value works directly — no mode switching needed. With `multi`, the
// value is a comma-separated list: picking an option appends instead of
// replacing, and already-picked options are hidden from the dropdown.
export default function ComboBox({
  value,
  onChange,
  options,
  placeholder,
  multi = false,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  multi?: boolean;
  className?: string;
}) {
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

  const picked = multi ? splitAssignees(value) : [];
  const remaining = multi
    ? options.filter((o) => !picked.includes(o))
    : options;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        className={`w-full text-sm ${remaining.length > 0 ? "pr-7" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {remaining.length > 0 && (
        <>
          <button
            type="button"
            className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-ink-3 hover:text-ink"
            title={t("showOptions")}
            aria-label={t("showOptions")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            ▾
          </button>
          {open && (
            <ul
              className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full min-w-max overflow-auto rounded-lg border border-edge bg-surface py-1 shadow-lg"
              role="listbox"
            >
              {remaining.map((o) => (
                <li key={o} role="option" aria-selected={o === value}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--gridline)]/60"
                    onClick={() => {
                      if (multi) {
                        onChange([...picked, o].join(", "));
                        // stay open to pick more; close after the last option
                        if (remaining.length <= 1) setOpen(false);
                      } else {
                        onChange(o);
                        setOpen(false);
                      }
                    }}
                  >
                    {o}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
