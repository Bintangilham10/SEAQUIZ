import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { RoomSnapshot } from "@/lib/types";

interface GetRoomSnapshotOptions {
  playerId?: string | null;
  playersLimit?: number;
  includeAnswerCount?: boolean;
}

async function getRoomSnapshotFallback(
  roomCode: string,
  { playerId, playersLimit = 50, includeAnswerCount = true }: GetRoomSnapshotOptions = {}
): Promise<RoomSnapshot | null> {
  const supabase = getSupabaseAdminClient();
  const safePlayersLimit = Math.max(0, Math.min(playersLimit, 50));

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_code, quiz_set_id, status, current_question_index, question_started_at")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (roomError || !room) {
    return null;
  }

  const [{ data: quizSet }, questionCountRes, playerCountRes, { data: players }, { data: question }] =
    await Promise.all([
      supabase.from("quiz_sets").select("title").eq("id", room.quiz_set_id).maybeSingle(),
      supabase.from("questions").select("*", { count: "exact", head: true }).eq("quiz_set_id", room.quiz_set_id),
      supabase.from("room_players").select("*", { count: "exact", head: true }).eq("room_id", room.id),
      safePlayersLimit > 0
        ? supabase
            .from("room_players")
            .select("id, display_name, guest_id, joined_at, total_score")
            .eq("room_id", room.id)
            .order("total_score", { ascending: false })
            .order("joined_at", { ascending: true })
            .limit(safePlayersLimit)
        : Promise.resolve({ data: [] }),
      supabase
        .from("questions")
        .select("id, text, time_limit_seconds, order_index")
        .eq("quiz_set_id", room.quiz_set_id)
        .eq("order_index", room.current_question_index)
        .maybeSingle()
    ]);

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

  const answerCountRes = includeAnswerCount && question
    ? await supabase
        .from("room_answers")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id)
        .eq("question_id", question.id)
    : { count: 0 };

  const selfStandingRes = playerId
    ? await supabase
        .from("room_players")
        .select("id, total_score, joined_at")
        .eq("room_id", room.id)
        .order("total_score", { ascending: false })
        .order("joined_at", { ascending: true })
    : { data: null };

  const selfStandingRows = selfStandingRes.data ?? [];
  const selfStandingIndex = playerId ? selfStandingRows.findIndex((row) => row.id === playerId) : -1;

  return {
    room,
    quizTitle: quizSet?.title ?? "Untitled Quiz",
    totalQuestions: questionCountRes.count ?? 0,
    playerCount: Math.max(playerCountRes.count ?? 0, players?.length ?? 0),
    players: players ?? [],
    currentQuestion: question
      ? {
          question,
          options: optionsRes.data ?? []
        }
      : null,
    currentQuestionAnswerCount: answerCountRes.count ?? 0,
    playerAnswerForCurrent: answerRes.data ?? null,
    selfStanding:
      selfStandingIndex >= 0
        ? {
            rank: selfStandingIndex + 1,
            score: selfStandingRows[selfStandingIndex]?.total_score ?? 0,
            total_players: selfStandingRows.length
          }
        : null
  };
}

function looksLikeRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RoomSnapshot>;
  return Boolean(snapshot.room && snapshot.quizTitle && Array.isArray(snapshot.players));
}

export async function getRoomSnapshot(
  roomCode: string,
  options: GetRoomSnapshotOptions = {}
): Promise<RoomSnapshot | null> {
  const supabase = getSupabaseAdminClient();
  const playersLimit = Math.max(0, Math.min(options.playersLimit ?? 50, 50));
  const includeAnswerCount = options.includeAnswerCount ?? true;

  const v2 = await supabase.rpc("get_room_snapshot_v2", {
    p_room_code: roomCode,
    p_player_id: options.playerId ?? null,
    p_players_limit: playersLimit,
    p_include_answer_count: includeAnswerCount
  });

  if (!v2.error && looksLikeRoomSnapshot(v2.data)) {
    return v2.data;
  }

  if (!v2.error && v2.data === null) {
    return null;
  }

  const legacy = await supabase.rpc("get_room_snapshot", {
    p_room_code: roomCode,
    p_player_id: options.playerId ?? null
  });

  if (!legacy.error && looksLikeRoomSnapshot(legacy.data)) {
    const snapshot = legacy.data;
    return {
      ...snapshot,
      players: snapshot.players.slice(0, playersLimit),
      currentQuestionAnswerCount: includeAnswerCount ? snapshot.currentQuestionAnswerCount : 0,
      selfStanding: snapshot.selfStanding ?? null
    };
  }

  if (!legacy.error && legacy.data === null) {
    return null;
  }

  return getRoomSnapshotFallback(roomCode, options);
}
