import { afterEach, describe, expect, it, vi } from "vitest";

import { getDebugUser, isDebugAuthBypassEnabled } from "@/lib/auth0";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("debug auth bypass", () => {
  it("is disabled in production even when the bypass env var is set", () => {
    vi.stubEnv("AUTH_DEBUG_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "0");

    expect(isDebugAuthBypassEnabled()).toBe(false);
  });

  it("does not grant admin access to debug users by default", async () => {
    vi.stubEnv("AUTH_DEBUG_EMAIL", "gmahajan@labelbox.com");

    await expect(getDebugUser()).resolves.toMatchObject({
      email: "gmahajan@labelbox.com",
      isAdmin: false
    });
  });

  it("only grants debug admin access when explicitly enabled for the configured debug email", async () => {
    vi.stubEnv("AUTH_DEBUG_EMAIL", "gmahajan@labelbox.com");
    vi.stubEnv("AUTH_DEBUG_ALLOW_ADMIN", "true");

    await expect(getDebugUser()).resolves.toMatchObject({
      email: "gmahajan@labelbox.com",
      isAdmin: true
    });
  });
});
