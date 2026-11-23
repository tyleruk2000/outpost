/**
 * The Library's reading screens and the page tree where the pointer is a finger: a phone with the text at 200%,
 * and a tablet on its side (1024 px, wider than the phone layout, still touched).
 */
import { api, expect, test } from "./fixtures";
import { buildPdf } from "./pdf";

async function addPdf(page: import("@playwright/test").Page, title: string): Promise<string> {
  const upload = await page.request.post("/api/documents", {
    headers: { "X-Outpost-Request": "1" },
    multipart: { file: { name: `${title}.pdf`, mimeType: "application/pdf", buffer: buildPdf([["One"], ["Two"], ["Three"]]) } },
  });
  expect(upload.ok()).toBe(true);
  return (await upload.json()).results[0].document.id;
}

/** How far each named control reaches past the right of the screen; empty when all are on it. */
async function offScreen(page: import("@playwright/test").Page, names: string[]): Promise<string[]> {
  const width = page.viewportSize()!.width;
  const out: string[] = [];
  for (const name of names) {
    const box = await page.getByRole("toolbar", { name: "Viewing controls" }).getByRole("button", { name }).boundingBox();
    if (!box || box.x < 0 || box.x + box.width > width + 1) out.push(`${name} at ${box ? Math.round(box.x + box.width) : "nowhere"}`);
  }
  return out;
}

test.describe("a PDF on a phone with the text at 200%", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
  });

  test("keeps every viewing control on the screen, the bar wrapping rather than scrolling sideways", async ({ page }) => {
    const id = await addPdf(page, "Large text bar");
    await page.goto(`/library/documents/${id}`);
    await expect(page.getByRole("toolbar", { name: "Viewing controls" }).getByRole("textbox", { name: /^Page/ })).toHaveValue("1");
    expect(await offScreen(page, ["Zoom out", "Zoom in", "More viewing controls"])).toEqual([]);
    await api(page, "DELETE", `/api/documents/${id}`);
  });
});

test.describe("a tablet on its side, touched", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test("gives the page number and the page tree a finger's size", async ({ page }) => {
    const id = await addPdf(page, "Tablet page number");
    await page.goto(`/library/documents/${id}`);
    const pageNumber = page.getByRole("toolbar", { name: "Viewing controls" }).getByRole("textbox", { name: /^Page/ });
    await expect(pageNumber).toHaveValue("1");
    expect((await pageNumber.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    // 16 px, so that iOS does not zoom the screen when it is touched.
    expect(await pageNumber.evaluate((field) => getComputedStyle(field).fontSize)).toBe("16px");
    await api(page, "DELETE", `/api/documents/${id}`);

    const made = (await api(page, "POST", "/api/notes", { title: "A page for the tablet" })).note;
    await page.goto(`/notes/${made.id}`);
    const row = page.getByRole("treeitem", { name: "A page for the tablet" });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await api(page, "DELETE", `/api/notes/${made.id}`);
  });
});
