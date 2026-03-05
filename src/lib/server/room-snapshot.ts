import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { RoomSnapshot } from "@/lib/types";

export async function getRoomSnapshot(
  roomCode: string,
  playerId?: string | null
): Promise<RoomSnapshot | null> {
  const supabase = getSupabaseAdminClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_code, quiz_set_id, status, current_question_index, question_started_at")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return null;
  }

  const [{ data: quizSet }, { data: questions }, { data: players }] = await Promise.all([
    supabase.from("quiz_sets").select("title").eq("id", room.quiz_set_id).maybeSingle(),
    supabase
      .from("questions")
      .select("id, text, time_limit_seconds, order_index")
      .eq("quiz_set_id", room.quiz_set_id)
      .order("order_index", { ascending: true }),
    supabase
      .from("room_players")
      .select("id, display_name, guest_id, joined_at, total_score")
      .eq("room_id", room.id)
      .order("total_score", { ascending: false })
      .order("joined_at", { ascending: true })
  ]);

  const question = questions?.[room.current_question_index] ?? null;

  const [optionsRes, answerRes] = await Promise.all([
    question
      ? supabase
          .from("options")
          .select("id, question_id, text")
          .eq("question_id", question.id)
          .order("id", { ascending: true })
      : Promise.resolve({ data: null }),
    playerId && question
      ? supabase
          .from("room_answers")
          .select("id, option_id, is_correct, score_awarded")
          .eq("room_id", room.id)
          .eq("player_id", playerId)
          .eq("question_id", question.id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const answerCountRes = question
    ? await supabase
        .from("room_answers")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id)
        .eq("question_id", question.id)
    : { count: 0 };

  return {
    room,
    quizTitle: quizSet?.title ?? "Untitled Quiz",
    totalQuestions: questions?.length ?? 0,
    players: players ?? [],
    currentQuestion: question
      ? {
          question,
          options: optionsRes.data ?? []
        }
      : null,
    currentQuestionAnswerCount: answerCountRes.count ?? 0,
    playerAnswerForCurrent: answerRes.data ?? null
  };
}
