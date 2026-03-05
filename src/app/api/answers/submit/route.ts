import { NextRequest } from "next/server";
import { ANSWER_BASE_SCORE, ANSWER_SPEED_BONUS_MAX } from "@/lib/constants";
import { fail, ok } from "@/lib/server/http";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();

  const body: {
    roomCode?: string;
    playerId?: string;
    questionId?: string;
    optionId?: string;
  } = await request.json().catch(() => ({}));

  const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
  const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
  const optionId = typeof body.optionId === "string" ? body.optionId.trim() : "";

  if (!roomCode || !playerId || !questionId || !optionId) {
    return fail("roomCode, playerId, questionId, and optionId are required.");
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, quiz_set_id, status, current_question_index, question_started_at")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return fail("Room not found.", 404);
  }

  if (room.status !== "running" || !room.question_started_at) {
    return fail("Question is not active.");
  }

  const { data: currentQuestion, error: questionError } = await supabase
    .from("questions")
    .select("id, time_limit_seconds")
    .eq("quiz_set_id", room.quiz_set_id)
    .eq("order_index", room.current_question_index)
    .maybeSingle();

  if (questionError || !currentQuestion) {
    return fail("Current question not found.", 500);
  }

  if (currentQuestion.id !== questionId) {
    return fail("Invalid question submission.", 409);
  }

  const elapsedSeconds = (Date.now() - new Date(room.question_started_at).getTime()) / 1000;
  if (elapsedSeconds > currentQuestion.time_limit_seconds) {
    return fail("Time is up for this question.");
  }

  const { data: player, error: playerError } = await supabase
    .from("room_players")
    .select("id, room_id, total_score")
    .eq("id", playerId)
    .eq("room_id", room.id)
    .maybeSingle();

  if (playerError || !player) {
    return fail("Player not found in this room.", 404);
  }

  const { data: existingAnswer } = await supabase
    .from("room_answers")
    .select("id")
    .eq("room_id", room.id)
    .eq("player_id", playerId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (existingAnswer) {
    return fail("Answer already submitted for this question.", 409);
  }

  const { data: selectedOption, error: optionError } = await supabase
    .from("options")
    .select("id, is_correct")
    .eq("id", optionId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (optionError || !selectedOption) {
    return fail("Selected option is invalid.", 400);
  }

  const remainingSeconds = Math.max(0, currentQuestion.time_limit_seconds - elapsedSeconds);
  const speedBonus = Math.max(
    0,
    Math.floor((remainingSeconds / currentQuestion.time_limit_seconds) * ANSWER_SPEED_BONUS_MAX)
  );
  const awardedScore = selectedOption.is_correct ? ANSWER_BASE_SCORE + speedBonus : 0;

  const { data: answer, error: answerError } = await supabase
    .from("room_answers")
    .insert({
      room_id: room.id,
      player_id: playerId,
      question_id: questionId,
      option_id: optionId,
      is_correct: selectedOption.is_correct,
      score_awarded: awardedScore,
      submitted_at: new Date().toISOString()
    })
    .select("id, is_correct, score_awarded")
    .maybeSingle();

  if (answerError || !answer) {
    return fail("Failed to submit answer.", 500);
  }

  if (awardedScore > 0) {
    const { error: scoreError } = await supabase
      .from("room_players")
      .update({
        total_score: player.total_score + awardedScore
      })
      .eq("id", playerId)
      .eq("room_id", room.id);

    if (scoreError) {
      return fail("Answer stored but score update failed.", 500);
    }
  }

  return ok("Answer submitted", {
    answer
  });
}
