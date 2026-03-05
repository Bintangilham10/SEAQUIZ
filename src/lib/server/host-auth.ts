import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const HOST_SESSION_COOKIE_NAME = "seachan_host_session";
export const HOST_SESSION_TTL_SECONDS = 60 * 60 * 12;

function getExpectedUsername() {
  return process.env.HOST_LOGIN_USERNAME ?? "";
}

function getExpectedPassword() {
  return process.env.HOST_LOGIN_PASSWORD ?? "";
}

function getHostAuthSecret() {
  return process.env.HOST_AUTH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "local-dev-host-secret";
}

function safeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signPayload(payload: string) {
  return createHmac("sha256", getHostAuthSecret()).update(payload).digest("hex");
}

export function validateHostCredentials(username: string, password: string) {
  if (!isHostCredentialConfigured()) return false;
  return safeEqualText(username, getExpectedUsername()) && safeEqualText(password, getExpectedPassword());
}

export function isHostCredentialConfigured() {
  return Boolean(getExpectedUsername() && getExpectedPassword());
}

export function createHostSessionToken() {
  const username = getExpectedUsername();
  if (!username) {
    throw new Error("HOST_LOGIN_USERNAME is not configured.");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${username}:${issuedAt}`;
  const signature = signPayload(payload);
  return `${username}.${issuedAt}.${signature}`;
}

export function isHostSessionTokenValid(token: string | null | undefined) {
  if (!token) return false;

  const [username, issuedAtRaw, signature] = token.split(".");
  if (!username || !issuedAtRaw || !signature) return false;

  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!Number.isFinite(issuedAt)) return false;
  if (!safeEqualText(username, getExpectedUsername())) return false;

  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > HOST_SESSION_TTL_SECONDS) return false;

  const expectedSignature = signPayload(`${username}:${issuedAt}`);
  return safeEqualText(signature, expectedSignature);
}

export function isHostSessionAuthorized(request: NextRequest) {
  const token = request.cookies.get(HOST_SESSION_COOKIE_NAME)?.value;
  return isHostSessionTokenValid(token);
}
