import { ok } from "@/lib/server/http";
import { HOST_SESSION_COOKIE_NAME } from "@/lib/server/host-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = ok("Host logged out", null);
  response.cookies.set(HOST_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
