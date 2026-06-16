import { isDebugAuthBypassEnabled } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { UserProfileInput, UserProfileRecord } from "@/lib/types";

type ProfileRow = {
  auth0_user_id: string;
  auth0_email: string | null;
  name: string;
  workforce_email: string | null;
  discord_id: string | null;
  hubstaff_email: string | null;
  created_at: string;
  updated_at: string;
};

type DebugProfile = UserProfileRecord & {
  auth0UserId: string;
};

const debugProfiles = new Map<string, DebugProfile>();

function profilePayload(input: UserProfileInput, auth0UserId: string, auth0Email: string | null) {
  return {
    auth0_user_id: auth0UserId,
    auth0_email: auth0Email,
    name: input.name,
    workforce_email: input.workforceEmail,
    discord_id: input.discordId,
    hubstaff_email: input.hubstaffEmail
  };
}

function toRecord(row: ProfileRow): UserProfileRecord {
  return {
    auth0Email: row.auth0_email,
    name: row.name,
    workforceEmail: row.workforce_email,
    discordId: row.discord_id,
    hubstaffEmail: row.hubstaff_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getUserProfile(auth0UserId: string) {
  if (isDebugAuthBypassEnabled()) {
    const profile = debugProfiles.get(auth0UserId);
    return profile
      ? {
          auth0Email: profile.auth0Email,
          name: profile.name,
          workforceEmail: profile.workforceEmail,
          discordId: profile.discordId,
          hubstaffEmail: profile.hubstaffEmail,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt
        }
      : null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("auth0_email, name, workforce_email, discord_id, hubstaff_email, created_at, updated_at")
    .eq("auth0_user_id", auth0UserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toRecord(data as ProfileRow) : null;
}

export async function upsertUserProfile(
  input: UserProfileInput,
  auth0UserId: string,
  auth0Email: string | null
) {
  if (isDebugAuthBypassEnabled()) {
    const existing = debugProfiles.get(auth0UserId);
    const now = new Date().toISOString();
    const profile: DebugProfile = {
      auth0UserId,
      auth0Email,
      name: input.name,
      workforceEmail: input.workforceEmail,
      discordId: input.discordId,
      hubstaffEmail: input.hubstaffEmail,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    debugProfiles.set(auth0UserId, profile);
    return getUserProfile(auth0UserId);
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("user_profiles").upsert(profilePayload(input, auth0UserId, auth0Email), {
    onConflict: "auth0_user_id"
  });

  if (error) {
    throw error;
  }

  return getUserProfile(auth0UserId);
}

export function clearDebugProfiles() {
  if (!isDebugAuthBypassEnabled()) {
    return 0;
  }

  const count = debugProfiles.size;
  debugProfiles.clear();
  return count;
}
