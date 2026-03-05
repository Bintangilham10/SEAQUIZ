import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { Panel } from "@/components/shared/panel";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("leaderboard_global")
    .select("guest_id, display_name, total_score_all_time, matches_played, updated_at")
    .order("total_score_all_time", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(10);

  return (
    <Panel className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Global Leaderboard</h1>
        <p className="text-sm text-slate-600">Top 10 players by accumulated score across all matches.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Rank</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">All-time Score</th>
              <th className="px-3 py-2 text-right">Matches</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row, index) => (
              <tr key={row.guest_id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold">{index + 1}</td>
                <td className="px-3 py-2">{row.display_name}</td>
                <td className="px-3 py-2 text-right font-semibold">{row.total_score_all_time}</td>
                <td className="px-3 py-2 text-right">{row.matches_played}</td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  No leaderboard data yet. Finish at least one room game first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
