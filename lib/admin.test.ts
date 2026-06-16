import { describe, expect, it } from "vitest";

import { ADMIN_EMAILS, isAdminEmail } from "@/lib/admin";

describe("admin allowlist", () => {
  it("allows the configured Labelbox admin emails", () => {
    expect(ADMIN_EMAILS).toEqual([
      "gmahajan@labelbox.com",
      "mbarros@labelbox.com",
      "rshori@labelbox.com",
      "hfell@labelbox.com"
    ]);

    for (const email of ADMIN_EMAILS) {
      expect(isAdminEmail(email)).toBe(true);
      expect(isAdminEmail(email.toUpperCase())).toBe(true);
    }
  });

  it("rejects missing and non-admin emails", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("worker@labelbox.com")).toBe(false);
    expect(isAdminEmail("gmahajan@alignerrworkforce.com")).toBe(false);
  });
});
