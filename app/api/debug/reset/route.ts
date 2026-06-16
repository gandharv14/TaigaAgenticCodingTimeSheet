import { NextResponse } from "next/server";

import { isDebugAuthBypassEnabled } from "@/lib/auth0";
import { clearDebugTimesheets } from "@/lib/timesheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDebugAuthBypassEnabled()) {
    return NextResponse.json({ error: "Debug auth is not enabled." }, { status: 404 });
  }

  const deleted = clearDebugTimesheets();
  const response = NextResponse.json({ ok: true, deleted });
  response.cookies.delete("debug_user_email");
  response.cookies.delete("debug_user_name");
  return response;
}
