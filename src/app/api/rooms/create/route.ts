import { NextRequest } from "next/server";
import { generateHostToken, generateRoomCode, hashHostToken } from "@/lib/utils";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdminClient();

  const body: { quizSetId?: string } = await request.json().catch(() => ({}));

  let quizSetId = typeof body.quizSetId === "string" ? body.quizSetId : null;

  if (quizSetId) {
    const { data: quizSet } = await supabase.from("quiz_sets").select("id").eq("id", quizSetId).maybeSingle();
    if (!quizSet) {
      quizSetId = null;
    }
  }

  if (!quizSetId) {
    const { data: fallbackQuizSet, error } = await supabase
      .from("quiz_sets")
      .select("id")
      .order("title", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !fallbackQuizSet) {
      return fail("Quiz set not found. Please run seed data first.", 500);
    }

    quizSetId = fallbackQuizSet.id;
  }

  for (let i = 0; i < 8; i += 1) {
    const roomCode = generateRoomCode();
    const rawHostToken = generateHostToken();
    const hashedHostToken = hashHostToken(rawHostToken);

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_token: hashedHostToken,
        quiz_set_id: quizSetId
      })
      .select("id, room_code, quiz_set_id, status, current_question_index, question_started_at")
      .maybeSingle();

    if (!error && data) {
      return ok("Room created", {
        room: data,
        hostToken: rawHostToken
      });
    }
  }

  return fail("Failed to create room after multiple attempts.", 500);
}
