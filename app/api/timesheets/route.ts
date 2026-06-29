import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth0";
import { createTimesheet, listTimesheetsForUser, TimesheetSchemaError } from "@/lib/timesheets";
import { validateTimesheetInput, validationMessages } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthenticated() {
  return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
}

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return unauthenticated();
  }

  try {
    const entries = await listTimesheetsForUser(currentUser.id);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load timesheets." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return unauthenticated();
  }

  const body = await request.json();
  const parsed = validateTimesheetInput(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timesheet.", issues: validationMessages(parsed.error) }, { status: 400 });
  }

  try {
    const entry = await createTimesheet(parsed.data, currentUser.id, currentUser.email);

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof TimesheetSchemaError) {
      return NextResponse.json(
        { error: "Timesheet database schema is out of date. Apply all Supabase migrations before submitting." },
        { status: 503 }
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to save timesheet." }, { status: 500 });
  }
}
