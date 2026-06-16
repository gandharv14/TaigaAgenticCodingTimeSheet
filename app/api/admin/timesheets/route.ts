import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth0";
import { listAllTimesheets } from "@/lib/timesheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (!currentUser.isAdmin) {
    return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
  }

  try {
    const entries = await listAllTimesheets();
    return NextResponse.json({ entries });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load admin timesheets." }, { status: 500 });
  }
}
