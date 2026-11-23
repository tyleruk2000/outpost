import { accessibilityFindings } from "./a11y";
import { checkDiagrams } from "./diagrams";
import { expect, test, watchForErrors } from "./fixtures";

const DIAGRAMS = [
  "tuned-old-scores",
  "tuned-pipeline",
  "tuned-discount",
  "tuned-stems",
  "tuned-saturation",
  "tuned-weights",
  "tuned-int8",
  "tuned-memory",
  "tuned-p95",
  "tuned-progress",
];

test.describe("how search was tuned", () => {
  test("opens from How search works, shows this Outpost's figures and passes the accessibility check in both themes", async ({ page }) => {
    // A long page with ten diagrams, checked twice: on a busy machine its first load can take a while.
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    await page.goto("/search/how-it-works");
    await page.locator("main header").getByRole("link", { name: "How search was tuned" }).click();
    await expect(page).toHaveURL(/\/search\/how-it-was-tuned$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "How search was tuned", level: 1 })).toBeVisible();

    const here = page.getByRole("region", { name: "This Outpost, beside the Pi measured here" });
    await expect(here.getByText(/the Pi: 59,351/)).toBeVisible();
    await expect(here.getByText(/Off: keyword search only|^On, [\d,]+ of/)).toBeVisible();

    const drawn = await checkDiagrams(page);
    expect(drawn.map((each) => each.name)).toEqual(DIAGRAMS);
    await expect(page.getByText(/nDCG@5 = 9\.71 ÷ 12\.07 = 0\.804/)).toBeVisible();

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => localStorage.setItem("outpost.theme", t), theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.reload();
      await expect(page.getByRole("heading", { name: "How search was tuned", level: 1 })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("figure[data-diagram]")).toHaveCount(DIAGRAMS.length);
      expect(await accessibilityFindings(page, "/search/how-it-was-tuned", theme)).toEqual([]);
    }
    await page.evaluate(() => localStorage.removeItem("outpost.theme"));
    expect(errors).toEqual([]);
  });
});
