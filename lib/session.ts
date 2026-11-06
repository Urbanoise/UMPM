import { createHmac, timingSafeEqual } from "node:crypto";

// The signed-in project manager, held in a signed cookie so that no session
// table is needed. Everything here fails closed: without AUTH_SECRET or
// PM_EMAILS nobody counts as signed in, and the site is simply read-only.
export const SESSION_COOKIE = "pm_session";
export const SESSION_SECONDS = 14 * 24 * 60 * 60;

const MIN_SECRET_LENGTH = 32;

function secret(): string | null {
  const value = process.env.AUTH_SECRET;
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

const signature = (payload: string, key: string) =>
  createHmac("sha256", key).update(payload).digest("base64url");

/**
 * PM_EMAILS is an environment variable because the repository is public. It is
 * read on every request, so removing an address ends that person's session too.
 */
export function isPm(email: string): boolean {
  return (process.env.PM_EMAILS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .includes(email.trim().toLowerCase());
}

export function createSession(email: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(
    JSON.stringify({
      email,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    })
  ).toString("base64url");
  return `${payload}.${signature(payload, key)}`;
}

/** The project manager a cookie belongs to, or null for a guest. */
export function sessionEmail(token: string | undefined): string | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, sent, extra] = token.split(".");
  if (!payload || !sent || extra !== undefined) return null;

  const expected = Buffer.from(signature(payload, key));
  const actual = Buffer.from(sent);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;

  try {
    const { email, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (typeof email !== "string" || typeof exp !== "number") return null;
    if (exp <= Date.now() / 1000) return null;
    return isPm(email) ? email : null;
  } catch {
    return null;
  }
}
