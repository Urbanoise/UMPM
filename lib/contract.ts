import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TASK_NAME_PRESETS } from "./presets";
import { todayStr } from "./dates";

/** The portal is missing configuration — a 500, not a bad gateway. */
export class ContractConfigError extends Error {}

// The client is created lazily and cached on globalThis for the same reason as
// the Postgres one in lib/db.ts: importing this module during `next build` must
// not require ANTHROPIC_API_KEY, and a dev hot-reload must not pile up clients.
const globalForAnthropic = globalThis as unknown as {
  __timelinesAnthropic?: Anthropic;
};

function getClient(): Anthropic {
  if (!globalForAnthropic.__timelinesAnthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ContractConfigError(
        "ANTHROPIC_API_KEY is not set — see README.md for contract upload setup"
      );
    }
    globalForAnthropic.__timelinesAnthropic = new Anthropic();
  }
  return globalForAnthropic.__timelinesAnthropic;
}

/** Vercel caps a serverless request body at ~4.5 MB; stay under it with room. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const PDF_TYPE = "application/pdf";
export const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// Mirrors what the app stores (lib/types.ts), minus the ids and the columns the
// portal owns itself (color_slot, sort_order). `notes` is not persisted — it is
// shown in the review step so the reader knows what was inferred rather than
// read off the page.
export const ContractDraftSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  start_date: DATE,
  end_date: DATE,
  responsible: z.string().nullable(),
  tentative: z.boolean(),
  signed_date: DATE.nullable(),
  contract_reference: z.string().nullable(),
  deliverables: z.array(z.object({ name: z.string(), due_date: DATE })),
  tasks: z.array(
    z.object({
      name: z.string(),
      start_date: DATE.nullable(),
      end_date: DATE.nullable(),
      assignee: z.string().nullable(),
    })
  ),
  notes: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ContractDraft = z.infer<typeof ContractDraftSchema>;

const SYSTEM = `You read signed consulting agreements and turn them into a project plan for a
project-management dashboard. The agreements are for transport planning and urban
mobility work, and are usually written in Georgian, sometimes in English.

Return the plan in the required JSON shape. Rules:

DATES
- Every date is a calendar date in YYYY-MM-DD form. Never return a relative
  phrase, a quarter, or a month on its own.
- Contracts usually express deadlines relative to an event: "within 30 calendar
  days of signature", "45 working days after the inception meeting". Resolve
  these against the contract's own signature date and put the arithmetic you did
  in "notes". Count working days as Mon-Fri when the contract says working days.
- If the contract has no signature date, resolve relative deadlines against the
  fallback date given in the user message, set "tentative" to true, and say so
  in "notes".
- "end_date" is the completion date of the whole engagement and must be on or
  after "start_date".

TENTATIVE
- Set "tentative" to true when the start date is conditional — awaiting
  signature, awaiting an advance payment, awaiting a notice to proceed — or when
  you had to invent it. Otherwise false. The dashboard shows these with a
  "Start TBD" badge and the reader is expected to shift both dates once the real
  date is known.

DELIVERABLES vs TASKS
- A deliverable is a document or output the contract obliges the consultant to
  hand over, and it must have a due date. Put those in "deliverables".
- A task is a stage of work — a phase, a survey, a modelling step. Put those in
  "tasks", where dates are optional.
- If something reads as a deliverable but carries no derivable date, put it in
  "tasks" with null dates rather than inventing a due date. Say so in "notes".
- Do not duplicate a deliverable as a task with a different name. The dashboard
  deliberately links a task and a deliverable that share a name within a
  project, so reuse the exact same name when one stage produces one document.

NAMES AND LANGUAGE
- Keep names in the language of the contract. Do not translate Georgian names
  into English.
- Where a deliverable clearly matches one of the house standard names listed in
  the user message, use that name verbatim so it matches the rest of the
  portal's data.
- "name" is the project name — short, how a colleague would refer to it (client
  or city plus the type of work), not the full legal title of the agreement.
  Put the full title and contract number in "contract_reference".
- "responsible" is the person named as project manager or team leader on the
  consultant's side, if the contract names one. Not the client's signatory.
  Null if nobody is named.

HONESTY
- "notes" is where you record every inference, ambiguity and assumption: dates
  you computed, items you moved between deliverables and tasks, anything the
  contract left unclear. A human reviews your output against the contract before
  it is saved, and these notes are what they check. Write them in the language
  of the contract.
- Set "confidence" to "low" when the document is hard to read, is not actually a
  contract, or left you guessing at the schedule; "high" only when the schedule
  was stated explicitly.
- Never invent a deliverable the contract does not mention to pad the plan.`;

type UploadedFile = {
  bytes: Buffer;
  mediaType: string;
  filename: string;
};

/** DOCX has no native document block, so convert it to text first. */
async function docxToText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  return value;
}

async function contractBlock(
  file: UploadedFile
): Promise<Anthropic.Beta.BetaContentBlockParam> {
  if (file.mediaType === PDF_TYPE) {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: file.bytes.toString("base64"),
      },
    };
  }
  const text = await docxToText(file.bytes);
  if (!text.trim()) {
    throw new Error("The Word document appears to contain no text.");
  }
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: text },
  };
}

/**
 * Read a signed agreement and propose a project plan. Nothing is written to the
 * database here — the draft goes back to the browser for review first.
 */
export async function extractContractDraft(
  file: UploadedFile
): Promise<ContractDraft> {
  const presets = TASK_NAME_PRESETS.map((p) => `- ${p.ge} / ${p.en}`).join("\n");

  const response = await getClient().beta.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(ContractDraftSchema),
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          await contractBlock(file),
          {
            type: "text",
            text: `Read the attached agreement (file name: ${file.filename}) and produce the project plan.

Today's date is ${todayStr()} — use it as the fallback date only if the contract has no signature date.

House standard deliverable names, for matching:
${presets}`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      "The model declined to process this document. It may not be a contract."
    );
  }
  const draft = response.parsed_output;
  if (!draft) {
    throw new Error("Could not read a project plan out of this document.");
  }
  return normalize(draft);
}

/**
 * Guard the two invariants the rest of the app relies on but the model cannot be
 * trusted to always honour: the project window must contain every date in the
 * plan, and end must not precede start. Without this the Gantt draws milestone
 * diamonds off the end of the project bar.
 */
function normalize(draft: ContractDraft): ContractDraft {
  const dates = [
    draft.start_date,
    draft.end_date,
    ...draft.deliverables.map((d) => d.due_date),
    ...draft.tasks.flatMap((t) => [t.start_date, t.end_date]),
  ].filter((d): d is string => !!d);

  return {
    ...draft,
    start_date: dates.reduce((a, b) => (b < a ? b : a), draft.start_date),
    end_date: dates.reduce((a, b) => (b > a ? b : a), draft.end_date),
  };
}
