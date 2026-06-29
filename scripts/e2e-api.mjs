const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010";

function dateTimeLocalToIso(value) {
  return new Date(value).toISOString();
}

function payloadFor(suffix, workforceEmail, tokenUsage) {
  return {
    clientSubmissionId: crypto.randomUUID(),
    workforceEmail,
    workSessions: [
      {
        sessionNumber: 1,
        startAt: dateTimeLocalToIso("2026-06-16T09:00"),
        endAt: dateTimeLocalToIso("2026-06-16T10:00")
      }
    ],
    totalHoursMode: "calculated",
    totalHoursOverride: null,
    problems: [
      {
        primaryProgrammingLanguage: suffix === "001" ? "TypeScript" : "Python",
        secondaryProgrammingLanguages: suffix === "001" ? "SQL" : "JavaScript",
        liveCompareProblemId: `LC-SCRIPT-${suffix}`,
        taskUrl: `https://taiga.example/tasks/LC-SCRIPT-${suffix}`,
        summary: `Scripted end-to-end check for ${suffix}.`,
        comments: "Created by scripts/e2e-api.mjs.",
        tokenUsage,
        blockedOnTaigaBug: false,
        turns: Array.from({ length: 5 }, (_, index) => ({
          turnNumber: index + 1,
          taskType: index === 0 ? "Debugging" : "Testing"
        }))
      }
    ]
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
const profile = await request("/api/profile");
assert(profile.profile.name === "Script User One", "Expected default profile name from debug user.");
const savedProfile = await request("/api/profile", {
  method: "PUT",
  body: JSON.stringify({
    name: "Script User One Updated",
    workforceEmail: "kx9m12@alignerrworkforce.com",
    discordId: "script_user_one",
    hubstaffEmail: "script-user-one@example.com"
  })
});
assert(savedProfile.profile.name === "Script User One Updated", "Expected profile name update.");
assert(savedProfile.profile.discordId === "script_user_one", "Expected Discord ID to round-trip.");
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
assert(created.entry.problems[0].primaryProgrammingLanguage === "TypeScript", "Expected primary language to round-trip.");
assert(created.entry.problems[0].secondaryProgrammingLanguages === "SQL", "Expected secondary language to round-trip.");
assert(created.entry.auth0Email === "script-user-one@labelbox.com", "Expected temporary login email to be stored.");
assert(created.entry.problems[0].turns.length === 5, "Expected five created turns.");
assert(created.entry.calculatedHours === 1, "Expected one calculated hour.");
assert(created.entry.reportedHours === 1, "Expected reported hours to default to calculated hours.");

const listed = await request("/api/timesheets");
assert(
  listed.entries.some((entry) => entry.id === created.entry.id),
  "Expected created entry to appear in history."
);

const editResponse = await fetch(`${baseUrl}/api/timesheets/${created.entry.id}`, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    ...(cookieHeader ? { Cookie: cookieHeader } : {})
  },
  body: JSON.stringify({
    ...payload,
    totalHoursMode: "override",
    totalHoursOverride: 1.25
  })
});
const editBody = await editResponse.json();
assert(editResponse.status === 409, `Expected submitted timesheets to be locked, got ${editResponse.status}.`);
assert(editBody.error === "Submitted timesheets cannot be edited.", "Expected immutable submission error message.");

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
assert(csv.includes("primary_programming_languages"), "Expected CSV to include primary language column.");
assert(csv.includes("TypeScript"), "Expected CSV to include first primary language.");
assert(csv.includes("script-user-two@labelbox.com"), "Expected CSV to include login email.");

await resetDebugData();
await setDebugUser("gmahajan@labelbox.com", "Gandharv Mahajan");
const afterReset = await request("/api/admin/timesheets");
assert(afterReset.entries.length === 0, "Expected test entries to be deleted after script coverage.");

console.log("Script E2E passed.");
