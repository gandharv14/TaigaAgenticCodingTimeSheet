import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth0";
import { timesheetsToCsv } from "@/lib/csv";
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
    const csv = timesheetsToCsv(await listAllTimesheets());

    return new NextResponse(csv, {
      headers: {
        "Content-Disposition": 'attachment; filename="timesheets.csv"',
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to export admin timesheets." }, { status: 500 });
  }
}
