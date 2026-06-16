import { describe, expect, it } from "vitest";

import { userOwnsEntry } from "@/lib/authz";

describe("ownership checks", () => {
  it("allows matching Auth0 user IDs", () => {
    expect(userOwnsEntry("auth0|abc", "auth0|abc")).toBe(true);
  });

  it("rejects missing or different Auth0 user IDs", () => {
    expect(userOwnsEntry("auth0|abc", "auth0|def")).toBe(false);
    expect(userOwnsEntry(null, "auth0|def")).toBe(false);
    expect(userOwnsEntry("auth0|abc", null)).toBe(false);
  });
});
