import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("leaderboard_global")
    .select("guest_id, display_name, total_score_all_time, matches_played, updated_at")
    .order("total_score_all_time", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(10);

  if (error) {
    return fail("Failed to load leaderboard.", 500);
  }

  return ok("Leaderboard loaded", data ?? []);
}
