"use client";

import { useRef, useState } from "react";
// Type-only: erased at compile time, so the Anthropic SDK that lib/contract.ts
// imports never reaches the client bundle.
import type { ContractDraft } from "@/lib/contract";
import { useLang } from "@/lib/i18n";

const MAX_MB = 4;
const ACCEPT = ".pdf,.docx";

// The extracted rows carry no database ids yet, so give each one a stable local
// key — without it React reuses inputs across rows when one is removed.
type Keyed<T> = T & { key: number };
type Deliverable = Keyed<ContractDraft["deliverables"][number]>;
type Task = Keyed<ContractDraft["tasks"][number]>;

type Phase = "pick" | "reading" | "review" | "saving";

export default function ContractUploadModal({
  people,
  onClose,
  onCreated,
}: {
  people: string[];
  onClose: () => void;
  onCreated: (projectId: number) => void;
}) {
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [responsible, setResponsible] = useState("");
  const [tentative, setTentative] = useState(false);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const nextKey = useRef(0);

  const busy = phase === "reading" || phase === "saving";

  function pickFile(picked: File | null) {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    const lower = picked.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
      setFile(null);
      setError(t("errContractType"));
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      setError(t("errContractSize", { mb: String(MAX_MB) }));
      return;
    }
    setFile(picked);
  }

  async function read() {
    if (!file) return;
    setError(null);
    setPhase("reading");
    const body = new FormData();
    body.append("file", file);

    let res: Response;
    try {
      res = await fetch("/api/contracts/extract", { method: "POST", body });
    } catch {
      setPhase("pick");
      setError(t("errContractRead"));
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setPhase("pick");
      setError(data?.error ?? t("errContractRead"));
      return;
    }

    const d = data as ContractDraft;
    setDraft(d);
    setName(d.name);
    setDescription(
      [d.description, d.contract_reference].filter(Boolean).join("\n")
    );
    setStartDate(d.start_date);
    setEndDate(d.end_date);
    setResponsible(d.responsible ?? "");
    setTentative(d.tentative);
    setDeliverables(d.deliverables.map((x) => ({ ...x, key: nextKey.current++ })));
    setTasks(d.tasks.map((x) => ({ ...x, key: nextKey.current++ })));
    setPhase("review");
  }

  async function create() {
    setError(null);
    if (!name.trim() || !startDate || !endDate) {
      setError(t("errRequired"));
      return;
    }
    if (endDate < startDate) {
      setError(t("errDates"));
      return;
    }
    setPhase("saving");
    const res = await fetch("/api/contracts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        start_date: startDate,
        end_date: endDate,
        responsible,
        tentative,
        // Blank rows are treated as deleted rather than rejected — emptying the
        // name is the quickest way to drop a row the contract did not really say.
        deliverables: deliverables
          .filter((d) => d.name.trim() && d.due_date)
          .map(({ name, due_date }) => ({ name, due_date })),
        tasks: tasks
          .filter((x) => x.name.trim())
          .map(({ name, start_date, end_date, assignee }) => ({
            name,
            start_date: start_date || null,
            end_date: end_date || null,
            assignee: assignee || null,
          })),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setPhase("review");
      setError(data?.error ?? t("errSave"));
      return;
    }
    onCreated(data.id as number);
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold">{t("contractTitle")}</h2>

        {phase === "pick" && (
          <div className="mt-4">
            <label className="block text-sm">
              <span className="text-ink-2">{t("contractPick")}</span>
              <input
                type="file"
                accept={ACCEPT}
                className="mt-1 w-full"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-2 text-xs text-ink-3">
              {t("contractPickHint", { mb: String(MAX_MB) })}
            </p>
          </div>
        )}

        {phase === "reading" && (
          <div className="mt-6 mb-2 text-center">
            <p className="text-sm text-ink-2">{t("contractReading")}</p>
            <p className="mt-1 text-xs text-ink-3">{t("contractReadingHint")}</p>
          </div>
        )}

        {(phase === "review" || phase === "saving") && draft && (
          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div>
              <p className="text-sm font-medium text-ink-2">
                {t("contractReview")}
              </p>
              <p className="mt-0.5 text-xs text-ink-3">
                {t("contractReviewHint")}
              </p>
            </div>

            {draft.confidence === "low" && (
              <p
                className="rounded-lg px-3 py-2 text-sm"
                style={{
                  background: "var(--meter-track)",
                  color: "var(--status-critical)",
                }}
              >
                {t("contractConfidenceLow")}
              </p>
            )}

            <label className="block text-sm">
              <span className="text-ink-2">{t("fieldName")}</span>
              <input
                className="mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-2">{t("fieldResponsible")}</span>
                <input
                  className="mt-1 w-full"
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                  list="contract-people"
                />
              </label>
              {draft.signed_date && (
                <p className="self-end pb-1.5 text-xs text-ink-3">
                  {t("contractSigned")}: {draft.signed_date}
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={tentative}
                onChange={(e) => setTentative(e.target.checked)}
              />
              <span className="text-ink">{t("fieldTentative")}</span>
            </label>

            {draft.notes.length > 0 && (
              <div className="rounded-lg border border-edge p-3">
                <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">
                  {t("contractNotes")}
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-ink-2">
                  {draft.notes.map((note, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span aria-hidden className="text-ink-3">
                        •
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section>
              <p className="text-sm font-medium text-ink-2">
                {t("contractDeliverables", { n: String(deliverables.length) })}
              </p>
              {deliverables.length === 0 ? (
                <p className="mt-1 text-xs text-ink-3">{t("contractNoRows")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {deliverables.map((d, i) => (
                    <li key={d.key} className="flex items-center gap-2">
                      <input
                        className="min-w-0 flex-1"
                        value={d.name}
                        aria-label={t("fieldName")}
                        onChange={(e) =>
                          setDeliverables((cur) =>
                            cur.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                      />
                      <input
                        type="date"
                        value={d.due_date}
                        aria-label={t("fieldEnd")}
                        onChange={(e) =>
                          setDeliverables((cur) =>
                            cur.map((x, j) =>
                              j === i ? { ...x, due_date: e.target.value } : x
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-danger px-2 py-1 text-xs"
                        aria-label={`${t("contractRemoveRow")} ${d.name}`}
                        onClick={() =>
                          setDeliverables((cur) =>
                            cur.filter((_, j) => j !== i)
                          )
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="text-sm font-medium text-ink-2">
                {t("contractTasks", { n: String(tasks.length) })}
              </p>
              {tasks.length === 0 ? (
                <p className="mt-1 text-xs text-ink-3">{t("contractNoRows")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {tasks.map((task, i) => (
                    <li
                      key={task.key}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        className="min-w-0 flex-1"
                        value={task.name}
                        aria-label={t("fieldTaskName")}
                        onChange={(e) =>
                          setTasks((cur) =>
                            cur.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                      />
                      <input
                        type="date"
                        value={task.start_date ?? ""}
                        aria-label={t("taskStart")}
                        onChange={(e) =>
                          setTasks((cur) =>
                            cur.map((x, j) =>
                              j === i
                                ? { ...x, start_date: e.target.value || null }
                                : x
                            )
                          )
                        }
                      />
                      <input
                        type="date"
                        value={task.end_date ?? ""}
                        aria-label={t("taskEnd")}
                        onChange={(e) =>
                          setTasks((cur) =>
                            cur.map((x, j) =>
                              j === i
                                ? { ...x, end_date: e.target.value || null }
                                : x
                            )
                          )
                        }
                      />
                      <input
                        className="w-32"
                        value={task.assignee ?? ""}
                        aria-label={t("assignee")}
                        list="contract-people"
                        onChange={(e) =>
                          setTasks((cur) =>
                            cur.map((x, j) =>
                              j === i
                                ? { ...x, assignee: e.target.value || null }
                                : x
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-danger px-2 py-1 text-xs"
                        aria-label={`${t("contractRemoveRow")} ${task.name}`}
                        onClick={() =>
                          setTasks((cur) => cur.filter((_, j) => j !== i))
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <datalist id="contract-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {phase === "review" && (
            <button
              type="button"
              className="btn mr-auto"
              onClick={() => {
                setDraft(null);
                setFile(null);
                setError(null);
                setPhase("pick");
              }}
            >
              {t("contractAnother")}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            {t("cancel")}
          </button>
          {phase !== "review" && phase !== "saving" ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={read}
              disabled={!file || busy}
            >
              {phase === "reading" ? t("contractReading") : t("contractRead")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={create}
              disabled={busy}
            >
              {phase === "saving" ? t("saving") : t("contractCreate")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
