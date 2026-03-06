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
  const viewerParam = request.nextUrl.searchParams.get("viewer");
  const viewer = viewerParam === "host" ? "host" : viewerParam === "player" ? "player" : playerId ? "player" : "host";
  const snapshot = await getRoomSnapshot(roomCode, {
    playerId,
    playersLimit: viewer === "host" ? 50 : 12,
    includeAnswerCount: viewer === "host"
  });

  if (!snapshot) {
    return fail(`Room ${roomCode} not found in active database.`, 404);
  }

  return ok("Room snapshot loaded", snapshot);
}
