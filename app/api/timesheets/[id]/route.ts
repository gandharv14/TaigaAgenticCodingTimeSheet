import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth0";
import { updateTimesheet } from "@/lib/timesheets";
import { validateTimesheetInput, validationMessages } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = validateTimesheetInput(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timesheet.", issues: validationMessages(parsed.error) }, { status: 400 });
  }

  try {
    const entry = await updateTimesheet(id, parsed.data, currentUser.id, currentUser.email);

    if (!entry) {
      return NextResponse.json({ error: "Timesheet not found." }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update timesheet." }, { status: 500 });
  }
}
