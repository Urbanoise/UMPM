// Sign in with Google, by the OAuth authorization code flow.
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export const STATE_COOKIE = "oauth_state";
export const STATE_SECONDS = 10 * 60;

export const redirectUri = (origin: string) =>
  `${origin}/api/auth/callback/google`;

export function googleAuthUrl(origin: string, state: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

/**
 * Trades the code for the verified address of the account that signed in. The
 * ID token comes straight from Google over TLS, so its signature needs no
 * separate check (OpenID Connect Core 3.1.3.7); its claims are still checked.
 */
export async function verifiedEmail(
  code: string,
  origin: string
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;

  const { id_token: idToken } = await res.json();
  if (typeof idToken !== "string") return null;
  const claims = JSON.parse(
    Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")
  );
  const valid =
    ISSUERS.includes(claims.iss) &&
    claims.aud === clientId &&
    claims.exp > Date.now() / 1000 &&
    claims.email_verified === true &&
    typeof claims.email === "string";
  return valid ? claims.email : null;
}
