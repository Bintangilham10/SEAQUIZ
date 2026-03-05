import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";

function readLegacyJwtRole(token: string): string | null {
  if (!token.startsWith("eyJ")) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as {
      role?: string;
    };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseAdminClient() {
  const serverEnv = getServerEnv();
  if (serverEnv.supabaseServiceRoleKey.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is using a publishable key. Please set it to Supabase secret/service_role key."
    );
  }

  const jwtRole = readLegacyJwtRole(serverEnv.supabaseServiceRoleKey);
  if (jwtRole === "anon") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is using anon key. Please replace it with service_role/secret key."
    );
  }

  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
