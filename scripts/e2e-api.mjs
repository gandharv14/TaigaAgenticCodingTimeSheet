const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";

function payloadFor(suffix, workforceEmail, tokenUsage) {
  return {
    workforceEmail,
    liveCompareProblemId: `LC-SCRIPT-${suffix}`,
    taskUrl: `https://taiga.example/tasks/LC-SCRIPT-${suffix}`,
    startAt: "2026-06-16T09:00",
    endAt: "2026-06-16T10:00",
    summary: `Scripted end-to-end check for ${suffix}.`,
    comments: "Created by scripts/e2e-api.mjs.",
    tokenUsage,
    blockedOnTaigaBug: false,
    turns: Array.from({ length: 5 }, (_, index) => ({
      turnNumber: index + 1,
      taskType: index === 0 ? "Debugging" : "Testing"
    }))
  };
}

let cookieHeader = "";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(options.headers ?? {})
    }
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookieHeader = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }

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

async function setDebugUser(email, name) {
  await request("/api/debug/session", {
    method: "POST",
    body: JSON.stringify({ email, name })
  });
}

async function resetDebugData() {
  await request("/api/debug/reset", {
    method: "POST"
  });
}

await resetDebugData();

await setDebugUser("script-user-one@labelbox.com", "Script User One");
const payload = payloadFor("001", "kx9m12@alignerrworkforce.com", 1234);
const initial = await request("/api/timesheets");
assert(Array.isArray(initial.entries), "Expected entries array from GET /api/timesheets.");
assert(initial.entries.length === 0, "Expected debug reset to clear user history.");

const created = await request("/api/timesheets", {
  method: "POST",
  body: JSON.stringify(payload)
});
assert(created.entry?.id, "Expected created entry id.");
assert(created.entry.workforceEmail === payload.workforceEmail, "Expected workforce email to round-trip.");
assert(created.entry.auth0Email === "script-user-one@labelbox.com", "Expected temporary login email to be stored.");
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

await setDebugUser("script-user-two@labelbox.com", "Script User Two");
const secondPayload = payloadFor("002", "ab12cd@alignerrworkforce.com", 2222);
const secondCreated = await request("/api/timesheets", {
  method: "POST",
  body: JSON.stringify(secondPayload)
});
assert(secondCreated.entry.auth0Email === "script-user-two@labelbox.com", "Expected second test user email.");

const secondListed = await request("/api/timesheets");
assert(secondListed.entries.length === 1, "Expected second user to see only their own entry.");
assert(secondListed.entries[0].id === secondCreated.entry.id, "Expected second user history isolation.");

let nonAdminRejected = false;
try {
  await request("/api/admin/timesheets");
} catch (error) {
  nonAdminRejected = String(error).includes("403");
}
assert(nonAdminRejected, "Expected non-admin to be rejected from admin API.");

await setDebugUser("gmahajan@labelbox.com", "Gandharv Mahajan");
const adminList = await request("/api/admin/timesheets");
assert(adminList.entries.length === 2, "Expected admin to see both test user entries.");
assert(
  adminList.entries.some((entry) => entry.auth0Email === "script-user-one@labelbox.com"),
  "Expected admin list to include first test user."
);
assert(
  adminList.entries.some((entry) => entry.auth0Email === "script-user-two@labelbox.com"),
  "Expected admin list to include second test user."
);

const csvResponse = await fetch(`${baseUrl}/api/admin/timesheets/export`, {
  headers: {
    Cookie: cookieHeader
  }
});
const csv = await csvResponse.text();
assert(csvResponse.ok, "Expected admin CSV export to succeed.");
assert(csv.includes("LC-SCRIPT-001"), "Expected CSV to include first entry.");
assert(csv.includes("LC-SCRIPT-002"), "Expected CSV to include second entry.");
assert(csv.includes("script-user-two@labelbox.com"), "Expected CSV to include login email.");

await resetDebugData();
await setDebugUser("gmahajan@labelbox.com", "Gandharv Mahajan");
const afterReset = await request("/api/admin/timesheets");
assert(afterReset.entries.length === 0, "Expected test entries to be deleted after script coverage.");

console.log("Script E2E passed.");
