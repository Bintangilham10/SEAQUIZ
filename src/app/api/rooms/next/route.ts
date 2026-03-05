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
    .select("id, quiz_set_id, status, current_question_index")
    .eq("room_code", roomCode)
    .eq("host_token", hashedToken)
    .maybeSingle();

  if (roomError || !room) {
    return fail("Invalid host credentials.", 401);
  }

  if (room.status === "finished") {
    return ok("Game already finished", { status: "finished" as const });
  }

  if (room.status !== "running") {
    return fail("Game is not running yet.", 409);
  }

  const { count: questionCount, error: countError } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_set_id", room.quiz_set_id);

  if (countError) {
    return fail("Unable to read question count.", 500);
  }

  const totalQuestions = questionCount ?? 0;
  if (totalQuestions === 0) {
    return fail("No questions found for this quiz set.", 500);
  }

  const nextIndex = room.current_question_index + 1;

  if (nextIndex >= totalQuestions) {
    const { error: finishError } = await supabase
      .from("rooms")
      .update({
        status: "finished",
        question_started_at: null,
        finished_at: new Date().toISOString()
      })
      .eq("id", room.id);

    if (finishError) {
      return fail("Failed to finish game.", 500);
    }

    const { error: leaderboardError } = await supabase.rpc("finalize_room_to_leaderboard", {
      p_room_id: room.id
    });

    if (leaderboardError) {
      return fail("Game finished but failed to update global leaderboard.", 500);
    }

    return ok("Game finished", { status: "finished" as const });
  }

  const { error: nextError } = await supabase
    .from("rooms")
    .update({
      status: "running",
      current_question_index: nextIndex,
      question_started_at: new Date().toISOString()
    })
    .eq("id", room.id);

  if (nextError) {
    return fail("Failed to move to next question.", 500);
  }

  return ok("Moved to next question", { status: "running" as const, currentQuestionIndex: nextIndex });
}
