/** "Answer from my library" on a phone 390 pixels wide, against the stand-in model server. */
import { api, expect, test, watchForErrors } from "./fixtures";

const MODEL_URL = process.env.OUTPOST_E2E_MODEL_URL!;

test.use({ viewport: { width: 390, height: 844 } });

test.describe("answer from my library, on a phone", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.request.fetch("/api/settings", {
      method: "PATCH",
      headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
      data: JSON.stringify({ "answers.enabled": false, "answers.model": "" }),
    });
    await page.close();
  });

  test("streams a long answer that can be stopped, with nothing spilling sideways", async ({ page }) => {
    const errors = watchForErrors(page);
    await api(page, "POST", "/api/notes", {
      title: "Tent pegs on a phone",
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Snow" }] },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Bury a snow peg sideways as a deadman anchor. Stamp the snow down over it and wait for it to set." },
            ],
          },
        ],
      },
    });
    await api(page, "PATCH", "/api/settings", {
      "answers.enabled": true,
      "answers.endpoint": `${MODEL_URL}/v1`,
      "answers.model": "stand-in-long",
    });

    await page.goto(`/search?q=${encodeURIComponent("snow peg deadman anchor")}`);
    await page.getByRole("button", { name: "Answer from my library" }).click();
    const panel = page.getByRole("region", { name: "Generated answer" });
    await expect(panel.getByTestId("answer-text")).toContainText("Paragraph 3");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(1);

    // Stop is a full-size target and within reach at the top of the answer.
    const stop = panel.getByRole("button", { name: "Stop" });
    const box = (await stop.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    await stop.click();
    await expect(panel.getByText("Stopped. The answer above is unfinished.")).toBeVisible();

    // The source is a page of notes, named with its heading, and its passage opens in place.
    await expect(panel.getByRole("link", { name: /Tent pegs on a phone/ })).toBeVisible();
    await panel.getByRole("button", { name: "Show the passage" }).first().click();
    await expect(panel.getByText(/Bury a snow peg sideways as a deadman anchor/).last()).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
