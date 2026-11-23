import { accessibilityFindings } from "./a11y";
import { checkDiagrams } from "./diagrams";
import { expect, test, watchForErrors } from "./fixtures";

test.describe("how search by meaning works", () => {
  test("opens from Settings, shows this Outpost's figures and passes the accessibility check in both themes", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/settings#semantic");
    const section = page.getByRole("region", { name: "Search by meaning" });
    await section.getByRole("link", { name: "How search by meaning works" }).click();
    await expect(page).toHaveURL(/\/search\/how-meaning-works$/);
    await expect(page.getByRole("heading", { name: "How search by meaning works", level: 1 })).toBeVisible();

    const here = page.getByRole("region", { name: "On this Outpost now" });
    await expect(here.getByText(/of [\d,]+ passages?/)).toBeVisible();
    await expect(here.getByText(/all-MiniLM-L6-v2/)).toBeVisible();
    await expect(here.getByRole("link", { name: /search by meaning in Settings/i })).toHaveAttribute("href", "/settings#semantic");

    const drawn = await checkDiagrams(page);
    expect(drawn.map((each) => each.name)).toEqual([
      "meaning-why",
      "meaning-model",
      "meaning-map",
      "meaning-nearest",
      "meaning-merge",
      "meaning-where",
    ]);

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => localStorage.setItem("outpost.theme", t), theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.reload();
      await expect(page.getByRole("heading", { name: "How search by meaning works", level: 1 })).toBeVisible();
      await expect(page.locator("figure[data-diagram]")).toHaveCount(6);
      await expect(page.getByRole("region", { name: "On this Outpost now" }).getByText(/of [\d,]+ passages?/)).toBeVisible();
      expect(await accessibilityFindings(page, "/search/how-meaning-works", theme)).toEqual([]);
    }
    await page.evaluate(() => localStorage.removeItem("outpost.theme"));

    // And back the other way: How search works links here.
    await page.goto("/search/how-it-works");
    await page.locator("#stage-meaning").getByRole("link", { name: "How search by meaning works" }).click();
    await expect(page).toHaveURL(/\/search\/how-meaning-works$/);
    expect(errors).toEqual([]);
  });
});
