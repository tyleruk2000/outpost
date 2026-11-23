/**
 * Tasks on Downloads and tasks: a real piece of work (reading a document that was just
 * added) is listed apart from downloads, and its page says what it was, how it went and
 * what happened, in both themes and on a phone.
 */
import { accessibilityInBothThemes } from "./a11y";
import { api, expect, test, watchForErrors } from "./fixtures";
import { buildPdf } from "./pdf";

const headers = { "X-Outpost-Request": "1" };

test.describe("tasks", () => {
  test.describe.configure({ mode: "serial" });
  let documentId = "";
  let jobId = "";

  test.beforeAll(async ({ request }) => {
    const upload = await request.post("/api/documents", {
      headers,
      multipart: {
        file: { name: "Task page notes.pdf", mimeType: "application/pdf", buffer: buildPdf([["Rope", "A bowline makes a fixed loop."]]) },
      },
    });
    expect(upload.ok()).toBe(true);
    documentId = (await upload.json()).results[0].document.id;
    await expect
      .poll(async () => (await (await request.get(`/api/documents/${documentId}`)).json()).document.extraction, { timeout: 20_000 })
      .toBe("done");
  });

  test.afterAll(async ({ request }) => {
    if (documentId) await request.delete(`/api/documents/${documentId}`, { headers });
  });

  test("lists a task that ran apart from downloads, and its page tells how it went", async ({ page }) => {
    const errors = watchForErrors(page);
    const { jobs } = await api(page, "GET", "/api/jobs?types=document.extract&limit=50");
    const mine = jobs.find((job: { title: string }) => job.title.includes("Task page notes"));
    expect(mine?.state).toBe("succeeded");
    jobId = mine.id;

    await page.goto("/downloads");
    await expect(page.getByRole("heading", { name: "Downloads and tasks", level: 1 })).toBeVisible();
    await expect(page.getByText(/A task is work Outpost does here, such as reading a document/).first()).toBeVisible();
    await page.getByRole("radio", { name: /^Tasks/ }).click();
    await expect(page).toHaveURL(/show=tasks/);
    await expect(page.getByRole("heading", { name: "In progress" })).toHaveCount(0);
    await page.getByRole("radio", { name: /^Finished \(\d+\)$/ }).click();
    const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: mine.title }) });
    await expect(row.getByText("Reading a document")).toBeVisible();
    await expect(row.getByText("Finished", { exact: true })).toBeVisible();
    expect(await accessibilityInBothThemes(page, "/downloads?show=tasks")).toEqual([]);

    await row.getByRole("link", { name: `Details of ${mine.title}` }).click();
    await expect(page).toHaveURL(new RegExp(`/downloads/tasks/${jobId}$`));
    await expect(page.getByRole("heading", { name: mine.title, level: 1 })).toBeVisible();
    await expect(page.getByText("Takes the text out of a document so that it can be searched and quoted.")).toBeVisible();
    const ended = page.locator("section").filter({ has: page.getByRole("heading", { name: "How it ended" }) });
    await expect(ended.getByText("Started", { exact: true })).toBeVisible();
    await expect(ended.getByText("Took")).toBeVisible();
    const happened = page.locator("section").filter({ has: page.getByRole("heading", { name: "What happened" }) });
    await expect(happened.getByText("Added to the queue")).toBeVisible();
    await expect(happened.getByText("Finished")).toBeVisible();
    await expect(page.getByText("document.extract")).toBeVisible();
    // The API says the same, with the history it was drawn from.
    const detail = await api(page, "GET", `/api/jobs/${jobId}/detail`);
    expect(detail.events.map((event: { state: string }) => event.state)).toEqual(["queued", "running", "succeeded"]);
    expect(await accessibilityInBothThemes(page, `/downloads/tasks/${jobId}`)).toEqual([]);

    // The way back, above the title (the sidebar has a link of the same name to the whole list).
    await page.locator(`a[href="/downloads?show=tasks"]`).first().click();
    await expect(page).toHaveURL(/\/downloads\?show=tasks$/);
    expect(errors).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("fits the task's page and the list without scrolling sideways", async ({ page }) => {
      test.skip(!jobId, "Needs the task from the test before.");
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.goto(`/downloads/tasks/${jobId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "What happened" })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.goto("/downloads?show=tasks");
      await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  });
});
