import { NextRequest } from "next/server";
import { ok } from "@/lib/server/http";
import { HOST_SESSION_COOKIE_NAME, isHostSessionTokenValid } from "@/lib/server/host-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(HOST_SESSION_COOKIE_NAME)?.value;
  const authenticated = isHostSessionTokenValid(token);
  return ok("Host session checked", {
    authenticated
  });
}
