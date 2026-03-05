import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export function getSupabaseAdminClient() {
  const serverEnv = getServerEnv();
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
