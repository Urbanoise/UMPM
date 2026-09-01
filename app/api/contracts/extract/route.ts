import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  ContractConfigError,
  DOCX_TYPE,
  MAX_UPLOAD_BYTES,
  PDF_TYPE,
  extractContractDraft,
} from "@/lib/contract";

// Reading a long agreement with high effort takes well over the default limit.
// Vercel clamps this to the plan's ceiling — 60s on Hobby, 300s on Pro.
export const maxDuration = 300;

// Accepts multipart/form-data with a single `file` field and returns a draft
// project for review. Deliberately writes nothing: POST /api/contracts/create
// saves the draft once a human has corrected it.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "expected a multipart form upload" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "the file is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `file is too large (${Math.round(
          file.size / 1024 / 1024
        )} MB). The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 }
    );
  }

  // Browsers occasionally send an empty or wrong Content-Type for .docx, so fall
  // back to the extension before rejecting.
  const name = file.name.toLowerCase();
  const mediaType =
    file.type === PDF_TYPE || name.endsWith(".pdf")
      ? PDF_TYPE
      : file.type === DOCX_TYPE || name.endsWith(".docx")
        ? DOCX_TYPE
        : null;
  if (!mediaType) {
    return NextResponse.json(
      { error: "only PDF and Word (.docx) files are supported" },
      { status: 415 }
    );
  }

  try {
    const draft = await extractContractDraft({
      bytes: Buffer.from(await file.arrayBuffer()),
      mediaType,
      filename: file.name,
    });
    return NextResponse.json(draft);
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: status(err) });
  }
}

function status(err: unknown): number {
  if (err instanceof ContractConfigError) return 500;
  if (err instanceof Anthropic.RateLimitError) return 429;
  if (err instanceof Anthropic.AuthenticationError) return 500;
  if (err instanceof Anthropic.APIConnectionError) return 504;
  return 502;
}

function message(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The portal's Claude API key is missing or invalid.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Claude API — try again in a moment.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Claude API — check the connection and retry.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Claude API error (${err.status}): ${err.message}`;
  }
  // Our own thrown errors (missing key, unreadable docx, refusal) are written
  // for the person at the keyboard, so pass them through.
  return err instanceof Error ? err.message : "Could not read this document.";
}
