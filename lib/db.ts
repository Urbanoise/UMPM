import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Postgres over HTTP: every request gets its own stateless fetch, which is what
// serverless deployments (Vercel) need — there is no connection pool to leak.
// The client is created lazily and cached on globalThis so that importing this
// module (during `next build`, or across dev hot-reloads) never needs
// DATABASE_URL and never opens more than one client per process.
const globalForDb = globalThis as unknown as {
  __timelinesSql?: NeonQueryFunction<false, false>;
};

function getSql(): NeonQueryFunction<false, false> {
  if (!globalForDb.__timelinesSql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set — see README.md for database setup"
      );
    }
    globalForDb.__timelinesSql = neon(url);
  }
  return globalForDb.__timelinesSql;
}

/** Run a query with `$1`, `$2` … placeholders and return all matching rows. */
export async function query<T>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return (await getSql().query(text, params)) as T[];
}

/** Run a query and return its first row, or `undefined` if there are none. */
export async function queryOne<T>(
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

/**
 * Send several statements as a single non-interactive transaction — one round
 * trip, all-or-nothing. The statements cannot depend on each other's results.
 */
export async function transaction(
  statements: { text: string; params?: unknown[] }[]
): Promise<void> {
  if (statements.length === 0) return;
  const sql = getSql();
  await sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? [])));
}
