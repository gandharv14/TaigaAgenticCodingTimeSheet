import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth0";
import { getUserProfile, upsertUserProfile } from "@/lib/profiles";
import { validateUserProfileInput, validationMessages } from "@/lib/validation";

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
    const profile = await getUserProfile(currentUser.id);
    return NextResponse.json({
      profile: profile ?? {
        auth0Email: currentUser.email,
        name: currentUser.name,
        workforceEmail: null,
        discordId: null,
        hubstaffEmail: null,
        createdAt: null,
        updatedAt: null
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return unauthenticated();
  }

  const body = await request.json();
  const parsed = validateUserProfileInput(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile.", issues: validationMessages(parsed.error) }, { status: 400 });
  }

  try {
    const profile = await upsertUserProfile(parsed.data, currentUser.id, currentUser.email);
    return NextResponse.json({ profile });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to save profile." }, { status: 500 });
  }
}
