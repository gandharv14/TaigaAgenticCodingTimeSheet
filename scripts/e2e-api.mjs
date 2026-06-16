const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";

const payload = {
  workforceEmail: "kx9m12@alignerrworkforce.com",
  liveCompareProblemId: "LC-SCRIPT-001",
  taskUrl: "https://taiga.example/tasks/LC-SCRIPT-001",
  startAt: "2026-06-16T09:00",
  endAt: "2026-06-16T10:00",
  summary: "Scripted end-to-end check for the timesheet API.",
  comments: "Created by scripts/e2e-api.mjs.",
  tokenUsage: 1234,
  blockedOnTaigaBug: false,
  turns: Array.from({ length: 5 }, (_, index) => ({
    turnNumber: index + 1,
    taskType: index === 0 ? "Debugging" : "Testing"
  }))
};

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const initial = await request("/api/timesheets");
assert(Array.isArray(initial.entries), "Expected entries array from GET /api/timesheets.");

const created = await request("/api/timesheets", {
  method: "POST",
  body: JSON.stringify(payload)
});
assert(created.entry?.id, "Expected created entry id.");
assert(created.entry.workforceEmail === payload.workforceEmail, "Expected workforce email to round-trip.");
assert(created.entry.auth0Email === "debug.alignerr@alignerr.com", "Expected debug Alignerr login email to be stored.");
assert(created.entry.turns.length === 5, "Expected five created turns.");

const listed = await request("/api/timesheets");
assert(
  listed.entries.some((entry) => entry.id === created.entry.id),
  "Expected created entry to appear in history."
);

const updatedPayload = {
  ...payload,
  summary: "Updated scripted end-to-end check for the timesheet API.",
  tokenUsage: 9876,
  turns: [...payload.turns, { turnNumber: 6, taskType: "Code review" }]
};

const updated = await request(`/api/timesheets/${created.entry.id}`, {
  method: "PUT",
  body: JSON.stringify(updatedPayload)
});
assert(updated.entry.tokenUsage === 9876, "Expected updated token usage.");
assert(updated.entry.turns.length === 6, "Expected updated sixth turn.");

console.log("Script E2E passed.");
