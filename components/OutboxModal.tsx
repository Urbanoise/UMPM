"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { fmtDate } from "@/lib/dates";
import type { PendingAssignment } from "@/lib/notifications";

export interface Outbox {
  items: PendingAssignment[];
  unknownPeople: string[];
  mailEnabled: boolean;
}

const itemKey = (item: PendingAssignment) => `${item.task_id}|${item.name}`;

// Assignment emails go out only from here. Every row is ticked to begin with, so
// the usual case is one click, and a PM unticks what was only a test.
export default function OutboxModal({
  outbox,
  onChanged,
  onClose,
}: {
  outbox: Outbox;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useLang();
  const { items, unknownPeople, mailEnabled } = outbox;
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const picked = items.filter((item) => !unticked.has(itemKey(item)));

  function toggle(item: PendingAssignment) {
    const key = itemKey(item);
    const next = new Set(unticked);
    if (!next.delete(key)) next.add(key);
    setUnticked(next);
  }

  async function act(action: "send" | "dismiss") {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          items: picked.map(({ task_id, name }) => ({ task_id, name })),
        }),
      });
      const result = await res.json();
      if (!res.ok || result.failed > 0) setFailed(true);
      await onChanged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("outboxTitle")}
        onClick={(e) => e.stopPropagation()}
        className="card max-h-full w-full max-w-lg overflow-y-auto p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold">{t("outboxTitle")}</h2>
        <p className="mt-1 text-sm text-ink-2">{t("outboxHint")}</p>

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-ink-3">{t("outboxEmpty")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-edge">
            {items.map((item) => (
              <li key={itemKey(item)}>
                <label className="flex cursor-pointer items-start gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!unticked.has(itemKey(item))}
                    onChange={() => toggle(item)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.name}</span>
                    <span className="block break-words text-ink-2">
                      {item.title}
                    </span>
                    <span className="block break-words text-ink-3">
                      {item.project} · {fmtDate(item.deadline, locale)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {unknownPeople.length > 0 && (
          <p className="mt-3 text-sm text-ink-3">
            {t("outboxNoAddress", { names: unknownPeople.join(", ") })}
          </p>
        )}
        {!mailEnabled && items.length > 0 && (
          <p className="mt-3 text-sm text-ink-3">{t("outboxMailOff")}</p>
        )}
        {failed && (
          <p role="alert" className="mt-3 text-sm text-[var(--status-critical)]">
            {t("outboxFailed")}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("outboxClose")}
          </button>
          {items.length > 0 && (
            <>
              <button
                type="button"
                className="btn disabled:opacity-40"
                disabled={busy || picked.length === 0}
                onClick={() => act("dismiss")}
              >
                {t("outboxDontSend", { n: String(picked.length) })}
              </button>
              <button
                type="button"
                className="btn btn-primary disabled:opacity-40"
                disabled={busy || picked.length === 0 || !mailEnabled}
                onClick={() => act("send")}
              >
                {t("outboxSend", { n: String(picked.length) })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
