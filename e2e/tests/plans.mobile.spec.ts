import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

const dipole = { kind: "horizontal-dipole", heightM: 5, ground: "average", broadsideDeg: null, gainDb: 0, feedlineLossDb: 0 };
const station = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  powerWatts: 5,
  antenna: dipole,
  antennaName: "Low horizontal dipole, 5 m",
  noise: "residential",
});

test.describe("Communication plans on a phone", () => {
  test("a plan fits a 390 px screen, matrix and all, and its exports are within reach of a thumb", async ({ page }) => {
    const errors = watchForErrors(page);
    const { plan } = await api(page, "POST", "/api/radio/communication-plans", {
      name: "Hill walk",
      notes: "",
      stations: [station("a", "Car park", 54.45, -3.02), station("b", "Summit shelter", 54.53, -3.21), station("c", "Home", 53.8, -1.55)],
      date: "2026-11-16",
      fromUtc: 8,
      toUtc: 16,
      bands: ["80m", "40m"],
      mode: "ssb",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "table" },
      links: [],
    });
    await page.goto(`/radio/plans/${plan.id}`);
    await page.getByRole("button", { name: "Work out the plan" }).click();
    await expect(page.getByRole("heading", { name: "How the bands are chosen" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: /Two-way reliability between Car park and Summit shelter by band and hour/ }),
    ).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Add to library", "Export as Markdown", "Add a station", "Work it out again", "Change Car park"]) {
      const button = await page.getByRole("button", { name }).boundingBox();
      expect(button!.height, name).toBeGreaterThanOrEqual(40);
    }
    // The plan's PDF: saving it is a link, and both it and the way into the library are full-sized targets.
    expect((await page.getByRole("link", { name: "Save as PDF" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole("button", { name: "Add to library" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // The matrix is one block to a pair at this width, each figure with its column's name.
    const row = page.getByRole("row", { name: /Car park and Home/ });
    await expect(row).toContainText(/km/);
    await api(page, "DELETE", `/api/radio/communication-plans/${plan.id}`);
    expect(errors).toEqual([]);
  });
});
