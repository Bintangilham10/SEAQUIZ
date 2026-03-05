import { NextRequest } from "next/server";
import { getRoomSnapshot } from "@/lib/server/room-snapshot";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: {
    params: {
      roomCode: string;
    };
  }
) {
  const roomCode = context.params.roomCode.toUpperCase();
  const playerId = request.nextUrl.searchParams.get("playerId");
  const snapshot = await getRoomSnapshot(roomCode, playerId);

  if (!snapshot) {
    return fail("Room not found.", 404);
  }

  return ok("Room snapshot loaded", snapshot);
}
