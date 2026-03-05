import { NextRequest } from "next/server";
import { MAX_ROOM_PLAYERS } from "@/lib/constants";
import { fail, ok } from "@/lib/server/http";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();

  const body: { roomCode?: string; displayName?: string; guestId?: string } = await request
    .json()
    .catch(() => ({}));

  const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";
  const guestId = typeof body.guestId === "string" ? body.guestId.trim() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 24) : "";

  if (!roomCode || !guestId || !displayName) {
    return fail("roomCode, guestId, and displayName are required.");
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, status")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return fail(`Room ${roomCode} not found in active database.`, 404);
  }

  if (room.status === "finished") {
    return fail("Room has finished.");
  }

  const { data: existingPlayer } = await supabase
    .from("room_players")
    .select("id, room_id, display_name, guest_id, joined_at, total_score")
    .eq("room_id", room.id)
    .eq("guest_id", guestId)
    .maybeSingle();

  if (existingPlayer) {
    return ok("Already joined this room", { player: existingPlayer });
  }

  const { count: playersCount } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", room.id);

  if ((playersCount ?? 0) >= MAX_ROOM_PLAYERS) {
    return fail("Room is full. Maximum 50 players reached.");
  }

  const { data: player, error: playerError } = await supabase
    .from("room_players")
    .insert({
      room_id: room.id,
      display_name: displayName,
      guest_id: guestId
    })
    .select("id, room_id, display_name, guest_id, joined_at, total_score")
    .maybeSingle();

  if (playerError || !player) {
    const reason = [playerError?.message, playerError?.details, playerError?.hint]
      .filter((value) => Boolean(value))
      .join(" | ");
    return fail(`Failed to join room. ${reason || "Unknown database error."}`, 500);
  }

  return ok("Joined room", { player });
}
