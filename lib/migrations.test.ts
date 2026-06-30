import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("timesheet submission migration", () => {
  it("creates an atomic idempotent submission function", async () => {
    const migration = await readFile(
      join(process.cwd(), "supabase/migrations/007_atomic_timesheet_submission.sql"),
      "utf8"
    );

    expect(migration).toContain("create or replace function public.create_timesheet_batch_transaction");
    expect(migration).toContain("on conflict (auth0_user_id, client_submission_id)");
    expect(migration).toContain("return v_batch_id;");
    expect(migration).toContain("grant execute on function public.create_timesheet_batch_transaction");
  });
});
