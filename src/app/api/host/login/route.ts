import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";
import {
  HOST_SESSION_COOKIE_NAME,
  HOST_SESSION_TTL_SECONDS,
  createHostSessionToken,
  isHostCredentialConfigured,
  validateHostCredentials
} from "@/lib/server/host-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isHostCredentialConfigured()) {
    return fail("Host login is not configured. Set HOST_LOGIN_USERNAME and HOST_LOGIN_PASSWORD.", 500);
  }

  const body: { username?: string; password?: string } = await request.json().catch(() => ({}));

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return fail("username and password are required.");
  }

  if (!validateHostCredentials(username, password)) {
    return fail("Invalid host credentials.", 401);
  }

  const response = ok("Host login success", { authenticated: true });
  response.cookies.set(HOST_SESSION_COOKIE_NAME, createHostSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HOST_SESSION_TTL_SECONDS
  });
  return response;
}
