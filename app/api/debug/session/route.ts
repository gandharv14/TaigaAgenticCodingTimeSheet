import { NextResponse } from "next/server";

import { isDebugAuthBypassEnabled } from "@/lib/auth0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "Debug auth is not enabled." }, { status: 404 });
}

export async function POST(request: Request) {
  if (!isDebugAuthBypassEnabled()) {
    return unavailable();
  }

  const body = (await request.json()) as { email?: unknown; name?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : email;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid debug user email is required." }, { status: 400 });
  }

  const response = NextResponse.json({ user: { email, name } });
  response.cookies.set("debug_user_email", email, { httpOnly: true, sameSite: "lax", path: "/" });
  response.cookies.set("debug_user_name", name, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}

export async function DELETE() {
  if (!isDebugAuthBypassEnabled()) {
    return unavailable();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("debug_user_email");
  response.cookies.delete("debug_user_name");
  return response;
}
