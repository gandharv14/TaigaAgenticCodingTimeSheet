import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RPC_NAME = "create_timesheet_batch_transaction";
const RPC_ARGUMENTS = [
  "p_auth0_user_id text",
  "p_auth0_email text",
  "p_client_submission_id text",
  "p_workforce_email text",
  "p_start_at timestamptz",
  "p_end_at timestamptz",
  "p_total_hours_override numeric",
  "p_work_sessions jsonb",
  "p_problems jsonb"
];

async function readProjectFile(path: string) {
  return readFile(join(process.cwd(), path), "utf8");
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("timesheet submission migration", () => {
  it("keeps the atomic RPC migration aligned with the app submission contract", async () => {
    const migration = normalizeSql(await readProjectFile("supabase/migrations/007_atomic_timesheet_submission.sql"));
    const timesheets = await readProjectFile("lib/timesheets.ts");

    expect(timesheets).toContain(`supabase.rpc("${RPC_NAME}"`);
    expect(migration).toContain(`create or replace function public.${RPC_NAME}(`);

    for (const argument of RPC_ARGUMENTS) {
      expect(migration).toContain(argument);
      expect(timesheets).toContain(argument.split(" ")[0]);
    }

    expect(migration).toContain("returns uuid");
    expect(migration).toContain(`revoke all on function public.${RPC_NAME}(`);
    expect(migration).toContain(`grant execute on function public.${RPC_NAME}(`);
    expect(migration).toContain("to service_role");
  });

  it("creates an atomic idempotent submission function", async () => {
    const migration = normalizeSql(await readProjectFile("supabase/migrations/007_atomic_timesheet_submission.sql"));

    expect(migration).toContain("on conflict (auth0_user_id, client_submission_id)");
    expect(migration).toContain("insert into public.timesheet_work_batches");
    expect(migration).toContain("insert into public.timesheet_batch_work_sessions");
    expect(migration).toContain("insert into public.timesheet_entries");
    expect(migration).toContain("insert into public.timesheet_turns");
    expect(migration).toContain("return v_batch_id;");
  });
});
