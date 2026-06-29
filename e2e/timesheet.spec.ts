import { expect, test, type Page } from "@playwright/test";

type TestPayload = {
  loginEmail: string;
  name: string;
  workforceEmail: string;
  primaryProgrammingLanguage: string;
  secondaryProgrammingLanguages: string;
  problemId: string;
  taskUrl: string;
  summary: string;
  tokenUsage: string;
};

const firstUser: TestPayload = {
  loginEmail: "playwright-user-one@labelbox.com",
  name: "Playwright User One",
  workforceEmail: "kx9m12@alignerrworkforce.com",
  primaryProgrammingLanguage: "TypeScript",
  secondaryProgrammingLanguages: "SQL",
  problemId: "LC-E2E-001",
  taskUrl: "https://taiga.example/tasks/LC-E2E-001",
  summary: "Implemented and validated the debug timesheet workflow.",
  tokenUsage: "4321"
};

const secondUser: TestPayload = {
  loginEmail: "playwright-user-two@labelbox.com",
  name: "Playwright User Two",
  workforceEmail: "ab12cd@alignerrworkforce.com",
  primaryProgrammingLanguage: "Python",
  secondaryProgrammingLanguages: "JavaScript",
  problemId: "LC-E2E-002",
  taskUrl: "https://taiga.example/tasks/LC-E2E-002",
  summary: "Checked admin history visibility across two temporary users.",
  tokenUsage: "2222"
};

async function setDebugUser(page: Page, email: string, name: string) {
  await page.request.post("/api/debug/session", {
    data: { email, name }
  });
}

async function resetDebugData(page: Page) {
  await page.request.post("/api/debug/reset");
}

async function createTimesheet(page: Page, payload: TestPayload, options: { testDraftSave?: boolean } = {}) {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "New work session" })).toBeVisible();
  await expect(page.getByLabel("Alignerr login email")).toHaveValue(payload.loginEmail);
  await expect(page.getByRole("textbox", { name: "Google Workforce email" })).toBeVisible();

  await page.getByLabel("Google Workforce email").fill(payload.workforceEmail);
  await page.getByLabel("Session 1 start time").fill("2026-06-16T09:00");
  await page.getByLabel("Session 1 end time").fill("2026-06-16T10:15");
  await expect(page.getByLabel("Total hours")).toHaveValue("1.25");
  await page.getByRole("button", { name: "Add work session" }).click();
  await page.getByLabel("Session 2 start time").fill("2026-06-16T14:00");
  await page.getByLabel("Session 2 end time").fill("2026-06-16T15:00");
  await expect(page.getByLabel("Total hours")).toHaveValue("2.25");
  await page.getByLabel("Total hours").fill("2.5");

  await page.getByLabel("Problem 1 Live Compare problem ID").fill(payload.problemId);
  await page.getByLabel("Problem 1 Primary programming language").fill(payload.primaryProgrammingLanguage);
  await page.getByLabel("Problem 1 Secondary programming languages").fill(payload.secondaryProgrammingLanguages);
  await page.getByLabel("Problem 1 Task URL").fill(payload.taskUrl);
  await expect(page.getByLabel("Number of turns for problem 1")).toHaveValue("5");
  await page.getByLabel("Increase turns for problem 1").click();
  await expect(page.getByLabel("Number of turns for problem 1")).toHaveValue("6");
  await page.getByLabel("Problem 1 turn 1 task type").selectOption("Root Cause Analysis");
  await page.getByLabel("Problem 1 turn 2 task type").selectOption("Code writing");
  await page.getByLabel("Problem 1 turn 6 task type").selectOption("Testing");
  await page.getByLabel("Problem 1 task description").fill(payload.summary);
  await page.getByLabel("Problem 1 Token usage").fill(payload.tokenUsage);
  await page.getByLabel("Problem 1 blocked on Taiga bug").check();
  await page.getByLabel("Problem 1 comments").fill("Created during Playwright end-to-end coverage.");

  await page.getByRole("button", { name: "Add another problem" }).click();
  await page.getByLabel("Problem 2 Live Compare problem ID").fill(`${payload.problemId}-B`);
  await page.getByLabel("Problem 2 Primary programming language").fill(payload.primaryProgrammingLanguage);
  await page.getByLabel("Problem 2 Secondary programming languages").fill(payload.secondaryProgrammingLanguages);
  await page.getByLabel("Problem 2 Task URL").fill(`${payload.taskUrl}-b`);
  await page.getByLabel("Problem 2 task description").fill("Logged a second problem in the same work session.");
  await page.getByLabel("Problem 2 Token usage").fill("1000");
  await page.getByLabel("Problem 2 comments").fill("Second problem, same payable work session.");
  await expect(page.getByLabel("Total hours")).toHaveValue("2.5");

  if (options.testDraftSave) {
    await page.getByRole("button", { exact: true, name: "Save" }).click();
    await expect(page.getByText("Progress saved to this browser.")).toBeVisible();

    await page.reload();

    await expect(page.getByText("Saved progress restored from this browser.")).toBeVisible();
    await expect(page.getByLabel("Google Workforce email")).toHaveValue(payload.workforceEmail);
    await expect(page.getByLabel("Session 2 end time")).toHaveValue("2026-06-16T15:00");
    await expect(page.getByLabel("Problem 1 Live Compare problem ID")).toHaveValue(payload.problemId);
    await expect(page.getByLabel("Problem 2 Live Compare problem ID")).toHaveValue(`${payload.problemId}-B`);
  }

  await page.getByRole("button", { name: "Submit timesheet" }).click();
  await expect(page.getByRole("dialog", { name: "Submit and lock this timesheet?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit and lock timesheet" })).toBeDisabled();
  await page.getByLabel(/I acknowledge this timesheet will be locked/).check();
  await page.getByRole("button", { name: "Submit and lock timesheet" }).click();

  await expect(page.getByText("Timesheet submitted.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "My history" })).toBeVisible();
  await expect(page.getByText(payload.problemId)).toBeVisible();
  await expect(page.getByText(`${payload.problemId}-B`)).toBeVisible();
  await expect(page.getByText("2 problems")).toBeVisible();
  await expect(page.getByText("11 turns")).toBeVisible();
  await expect(page.getByText("2.50 hours (override)")).toBeVisible();
  await expect(page.getByText(`${(Number(payload.tokenUsage) + 1000).toLocaleString()} tokens`)).toBeVisible();
  await expect(page.getByText("Taiga blocked")).toBeVisible();
}

test("debug user can save, submit, and cannot edit a submitted timesheet", async ({ page }) => {
  await resetDebugData(page);
  await setDebugUser(page, firstUser.loginEmail, firstUser.name);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(firstUser.name);
  await page.getByLabel("Name").fill("Playwright User One Updated");
  await page.getByRole("textbox", { name: "Workforce email", exact: true }).fill(firstUser.workforceEmail);
  await page.getByLabel("Discord ID").fill("playwright_user_one");
  await page.getByLabel("Hubstaff email").fill("playwright-user-one@example.com");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByLabel("Google Workforce email")).toHaveValue(firstUser.workforceEmail);

  await createTimesheet(page, firstUser, { testDraftSave: true });
  await expect(page.getByRole("link", { name: "Admin portal" })).toHaveCount(0);
  await expect(page.getByLabel("Google Workforce email")).toHaveValue(firstUser.workforceEmail);
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel(new RegExp(`Edit ${firstUser.problemId}`))).toHaveCount(0);

  const historyResponse = await page.request.get("/api/timesheets");
  expect(historyResponse.ok()).toBe(true);
  const history = (await historyResponse.json()) as { entries: { id: string }[] };
  const editResponse = await page.request.put(`/api/timesheets/${history.entries[0].id}`, { data: {} });
  expect(editResponse.status()).toBe(409);

  await resetDebugData(page);
});

test("blank active hours override blocks timesheet submission", async ({ page }) => {
  await resetDebugData(page);
  await setDebugUser(page, firstUser.loginEmail, firstUser.name);

  await page.goto("/");
  await page.getByLabel("Google Workforce email").fill(firstUser.workforceEmail);
  await page.getByLabel("Session 1 start time").fill("2026-06-16T09:00");
  await page.getByLabel("Session 1 end time").fill("2026-06-16T10:15");
  await expect(page.getByLabel("Total hours")).toHaveValue("1.25");

  await page.getByLabel("Total hours").fill("");
  await expect(page.getByText("Enter a total hours override or clear the override.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit timesheet" })).toBeDisabled();

  await page.getByRole("button", { name: "Clear override" }).click();
  await expect(page.getByText("Enter a total hours override or clear the override.")).toHaveCount(0);
  await expect(page.getByLabel("Total hours")).toHaveValue("1.25");

  await resetDebugData(page);
});

test("admin can view all timesheets and download CSV", async ({ page }) => {
  await resetDebugData(page);

  await setDebugUser(page, firstUser.loginEmail, firstUser.name);
  await createTimesheet(page, firstUser);

  await setDebugUser(page, secondUser.loginEmail, secondUser.name);
  await createTimesheet(page, secondUser);
  await expect(page.getByText(firstUser.problemId)).toHaveCount(0);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin access required" })).toBeVisible();

  await setDebugUser(page, "gmahajan@labelbox.com", "Gandharv Mahajan");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Admin portal" })).toBeVisible();
  await page.getByRole("link", { name: "Admin portal" }).click();

  await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible();
  await expect(page.getByText("2 work sessions across all users")).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: firstUser.problemId })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: secondUser.problemId })).toBeVisible();
  await expect(page.getByText(firstUser.loginEmail)).toBeVisible();
  await expect(page.getByText(secondUser.loginEmail)).toBeVisible();
  await expect(page.getByText(firstUser.primaryProgrammingLanguage).first()).toBeVisible();
  await expect(page.getByText(secondUser.primaryProgrammingLanguage).first()).toBeVisible();
  await expect(page.getByText(/Updates every 15s/)).toBeVisible();

  const analytics = page.getByTestId("admin-analytics");
  await expect(analytics.getByRole("heading", { name: "Raw Category Distribution Across All Turns" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Category Share Of All Turns" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Average Category Distribution Per Task" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Delta vs Ideal Turn Category Distribution" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Token Usage Distribution" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Turn Count vs Token Usage" })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Reported Hours vs Token Usage" })).toBeVisible();
  await expect(analytics.getByText("Problems analyzed", { exact: true })).toBeVisible();
  await expect(analytics.getByText("Total turns", { exact: true })).toBeVisible();
  await expect(analytics.getByText("22", { exact: true }).first()).toBeVisible();
  await expect(analytics.getByText("Average handling time", { exact: true })).toBeVisible();
  await expect(analytics.getByText("2.50 hrs", { exact: true })).toBeVisible();
  await expect(analytics.getByText("Token rows", { exact: true })).toBeVisible();
  await expect(analytics.getByText("Token outliers removed", { exact: true })).toBeVisible();
  await expect(analytics.getByText(/Filtered out 0 obvious outlier work sessions/)).toBeVisible();
  await expect(analytics.getByText(/Hours range: 0\.00-24\.00 hrs/)).toBeVisible();
  await expect(analytics.getByText("Debugging").first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const { readFile } = await import("node:fs/promises");
  const csv = await readFile(path as string, "utf8");
  expect(csv).toContain(firstUser.problemId);
  expect(csv).toContain(secondUser.problemId);
  expect(csv).toContain(firstUser.workforceEmail);
  expect(csv).toContain(secondUser.workforceEmail);
  expect(csv).toContain(firstUser.primaryProgrammingLanguage);
  expect(csv).toContain(secondUser.secondaryProgrammingLanguages);
  expect(csv).toContain("playwright-user-one@labelbox.com");

  await resetDebugData(page);
  await setDebugUser(page, "gmahajan@labelbox.com", "Gandharv Mahajan");
  await page.goto("/admin");
  await expect(page.getByText("0 work sessions across all users")).toBeVisible();
});
