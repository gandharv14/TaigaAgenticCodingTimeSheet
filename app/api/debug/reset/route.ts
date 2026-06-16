import { NextResponse } from "next/server";

import { isDebugAuthBypassEnabled } from "@/lib/auth0";
import { clearDebugProfiles } from "@/lib/profiles";
import { clearDebugTimesheets } from "@/lib/timesheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDebugAuthBypassEnabled()) {
    return NextResponse.json({ error: "Debug auth is not enabled." }, { status: 404 });
  }

  const deleted = clearDebugTimesheets();
  const deletedProfiles = clearDebugProfiles();
  const response = NextResponse.json({ ok: true, deleted, deletedProfiles });
  response.cookies.delete("debug_user_email");
  response.cookies.delete("debug_user_name");
  return response;
}
