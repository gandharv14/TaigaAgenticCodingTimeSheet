import { expect, test } from "@playwright/test";

test("debug user can create and edit a timesheet", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "New timesheet" })).toBeVisible();
  await expect(page.getByLabel("Alignerr login email")).toHaveValue("debug.alignerr@alignerr.com");
  await expect(page.getByLabel("Google Workforce email")).toHaveValue("");
  await expect(page.getByPlaceholder("Kx9m**@alignerrworkforce.com")).toBeVisible();

  await page.getByLabel("Google Workforce email").fill("kx9m12@alignerrworkforce.com");
  await page.getByLabel("Live Compare problem ID").fill("LC-E2E-001");
  await page.getByLabel("Task URL").fill("https://taiga.example/tasks/LC-E2E-001");
  await page.getByLabel("Start time").fill("2026-06-16T09:00");
  await page.getByLabel("End time").fill("2026-06-16T10:15");

  await expect(page.getByLabel("Number of turns")).toHaveValue("5");
  await page.getByLabel("Increase turns").click();
  await expect(page.getByLabel("Number of turns")).toHaveValue("6");
  await page.locator("select").first().selectOption("Root Cause Analysis");
  await page.locator("select").nth(1).selectOption("Code writing");
  await page.locator("select").nth(5).selectOption("Testing");

  await page.getByLabel("In 100 words or less describe your task").fill("Implemented and validated the debug timesheet workflow.");
  await page.getByLabel("Token usage").fill("4321");
  await page
    .getByLabel("Were you blocked on this task because of a Taiga error or bug?")
    .check();
  await page.getByLabel("Any comments").fill("Created during Playwright end-to-end coverage.");

  await page.getByRole("button", { name: "Submit timesheet" }).click();

  await expect(page.getByText("Timesheet submitted.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "My history" })).toBeVisible();
  await expect(page.getByText("LC-E2E-001")).toBeVisible();
  await expect(page.getByText("6 turns")).toBeVisible();
  await expect(page.getByText("4,321 tokens")).toBeVisible();
  await expect(page.getByText("Taiga blocked")).toBeVisible();
  await expect(page.getByLabel("Google Workforce email")).toHaveValue("");

  await page.getByLabel("Edit LC-E2E-001").click();

  await expect(page.getByRole("heading", { name: "Edit timesheet" })).toBeVisible();
  await expect(page.getByLabel("Google Workforce email")).toHaveValue("kx9m12@alignerrworkforce.com");
  await page.getByLabel("Token usage").fill("7777");
  await page.getByLabel("Any comments").fill("Updated during Playwright end-to-end coverage.");
  await page.getByRole("button", { name: "Update timesheet" }).click();

  await expect(page.getByText("Timesheet updated.")).toBeVisible();
  await expect(page.getByText("7,777 tokens")).toBeVisible();
});
