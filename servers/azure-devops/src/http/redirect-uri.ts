/**
 * Redirect URI validation for the /authorize proxy (open-redirect defence).
 * Only http(s) is accepted; with an allowlist the match is exact, without one
 * https is accepted everywhere and http only for loopback hosts.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isAllowedRedirectUri(value: string | null | undefined, allowlist: string[] | null): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (allowlist && allowlist.length > 0) return allowlist.includes(value);
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  return true;
}
