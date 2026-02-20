import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mwadppyrqzuzgstmwpuy.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWRwcHlycXp1emdzdG13cHV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzU0MjcsImV4cCI6MjA4MDExMTQyN30._bWsOu6D-UAMKsxEMzN7PhMM4ENIXr2uZWdVLcoILk4";

interface Preferences {
  email: string;
  password: string;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cachedUserId: string | null = null;

export async function getAuthenticatedClient(): Promise<{ client: SupabaseClient; userId: string }> {
  // Try cached session first
  const cachedToken = await LocalStorage.getItem<string>("sb_access_token");
  const cachedRefresh = await LocalStorage.getItem<string>("sb_refresh_token");
  const storedUserId = await LocalStorage.getItem<string>("sb_user_id");

  if (cachedToken && cachedRefresh) {
    const { data, error } = await supabase.auth.setSession({
      access_token: cachedToken,
      refresh_token: cachedRefresh,
    });

    if (!error && data.session) {
      // Save potentially refreshed tokens
      await LocalStorage.setItem("sb_access_token", data.session.access_token);
      await LocalStorage.setItem("sb_refresh_token", data.session.refresh_token);
      cachedUserId = data.session.user.id;
      return { client: supabase, userId: data.session.user.id };
    }
  }

  // Fall back to email/password login
  const { email, password } = getPreferenceValues<Preferences>();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }

  if (!data.session) {
    throw new Error("No session returned after login");
  }

  // Cache the session
  await LocalStorage.setItem("sb_access_token", data.session.access_token);
  await LocalStorage.setItem("sb_refresh_token", data.session.refresh_token);
  await LocalStorage.setItem("sb_user_id", data.session.user.id);
  cachedUserId = data.session.user.id;

  return { client: supabase, userId: data.session.user.id };
}

export function getCachedUserId(): string | null {
  return cachedUserId;
}
