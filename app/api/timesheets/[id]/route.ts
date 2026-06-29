import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  return NextResponse.json({ error: "Submitted timesheets cannot be edited." }, { status: 409 });
}
