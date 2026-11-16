import { api, expect, test, watchForErrors } from "./fixtures";

/**
 * Importing files as pages, against the packaged app. Files are converted in a process
 * of their own there (`workers/convert.mjs`), so this is the check that the bundle can
 * start it, and that a file built to be slow costs the server nothing a person would see.
 */
test.describe("importing pages", () => {
  test("brings in a Markdown file and an HTML file built to be slow, linked to each other, while the server goes on answering", async ({
    page,
  }) => {
    const errors = watchForErrors(page);
    // Four thousand empty elements: sixteen seconds of the server's own thread before the converter was given its own process.
    const slow = `<html><head><title>Rain barrel</title></head><body><h1>Rain barrel</h1><p>Empty it before the first frost.</p><p>${"<i></i>".repeat(4000)}</p></body></html>`;
    const guide = "# Winter jobs\n\nStart with the [rain barrel](barrel.html), then the gutters.\n";

    const uploaded = await page.request.post("/api/imports", {
      headers: { "X-Outpost-Request": "1" },
      multipart: {
        guide: { name: "winter.md", mimeType: "text/markdown", buffer: Buffer.from(guide) },
        barrel: { name: "barrel.html", mimeType: "text/html", buffer: Buffer.from(slow) },
      },
    });
    expect(uploaded.ok(), await uploaded.text()).toBe(true);
    const id = (await uploaded.json()).import.id as string;

    // While the files are read, the server answers something else promptly.
    const asked = Date.now();
    await api(page, "GET", "/api/health");
    expect(Date.now() - asked).toBeLessThan(2000);

    await expect.poll(async () => (await api(page, "GET", `/api/imports/${id}`)).import.state, { timeout: 20_000 }).toBe("ready");
    const plan = (await api(page, "GET", `/api/imports/${id}`)).import.analysis;
    const pages = plan.items.filter((item: { kind: string }) => item.kind === "page");
    expect(pages.map((item: { title: string }) => item.title).sort()).toEqual(["Rain barrel", "Winter jobs"]);
    // Converted as it stands, not given up on and imported empty.
    expect(pages.flatMap((item: { warnings: string[] }) => item.warnings)).toEqual([]);

    await api(page, "POST", `/api/imports/${id}/commit`, { duplicates: "skip", pdfs: "library" });
    await expect.poll(async () => (await api(page, "GET", `/api/imports/${id}`)).import.state, { timeout: 20_000 }).toBe("completed");
    const report = (await api(page, "GET", `/api/imports/${id}`)).import.report;
    expect(report.failed).toEqual([]);
    const created = report.created as Array<{ noteId: string; title: string }>;
    const winter = created.find((entry) => entry.title === "Winter jobs")!;
    const barrel = created.find((entry) => entry.title === "Rain barrel")!;

    // The page reads as written, and its link goes to the other imported page.
    await page.goto(`/notes/${winter.noteId}`);
    const editor = page.getByRole("textbox", { name: "Page content" });
    // A link to a page is shown by that page's title, so the capital says the link found its page.
    await expect(editor).toContainText("Start with the Rain barrel, then the gutters.");
    await page.goto(`/notes/${barrel.noteId}`);
    await expect(page.getByLabel("Page title")).toHaveValue("Rain barrel");
    await expect(page.getByRole("textbox", { name: "Page content" })).toContainText("Empty it before the first frost.");
    const linked = (await api(page, "GET", `/api/notes/${barrel.noteId}`)).note.backlinks.map((note: { title: string }) => note.title);
    expect(linked).toEqual(["Winter jobs"]);

    // Left as found for the tests that follow.
    for (const entry of created) await api(page, "DELETE", `/api/notes/${entry.noteId}`);
    expect(errors).toEqual([]);
  });
});
