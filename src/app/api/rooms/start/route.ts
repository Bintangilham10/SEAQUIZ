import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { hashHostToken } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();
  const body: { roomCode?: string; hostToken?: string } = await request.json().catch(() => ({}));

  const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";
  const hostToken = typeof body.hostToken === "string" ? body.hostToken.trim() : "";

  if (!roomCode || !hostToken) {
    return fail("roomCode and hostToken are required.");
  }

  const hashedToken = hashHostToken(hostToken);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, status")
    .eq("room_code", roomCode)
    .eq("host_token", hashedToken)
    .maybeSingle();

  if (roomError || !room) {
    return fail("Invalid host credentials.", 401);
  }

  if (room.status === "running") {
    return ok("Game already running", null);
  }

  if (room.status === "finished") {
    return fail("Game already finished.", 409);
  }

  const { error: updateError } = await supabase
    .from("rooms")
    .update({
      status: "running",
      current_question_index: 0,
      question_started_at: new Date().toISOString(),
      finished_at: null
    })
    .eq("id", room.id);

  if (updateError) {
    return fail("Failed to start game.", 500);
  }

  return ok("Game started", null);
}
