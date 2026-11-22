/**
 * Steading on a phone: reached from the More sheet under Games, a settlement founded in the
 * river valley from a seed typed in, a woodcutter built on a meadow beside the woods, the
 * settlement found the same after a reload (it is kept on the server, for the household),
 * and started again from the foot of the screen. Nothing scrolls sideways.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Steading on a phone", () => {
  test("founds a settlement, builds a woodcutter by the woods, and starts again", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await api(page, "DELETE", "/api/games/steading");

    // Reached from the More sheet, under Games.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Games" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/games/steading"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Steading" })).toBeVisible();
    await expect(page.getByText("Leave it as long as you like: nothing here ever gets worse while you are away.")).toBeVisible();

    // Founding: the land and a seed typed in, which is cleaned to the form the map is drawn from.
    const valley = page.getByRole("radio", { name: /^River valley/ });
    await expect(valley).toBeChecked();
    await expect(page.getByRole("img", { name: /^The map this land and seed draw: woods \d+%/ })).toBeVisible();
    const seed = page.getByRole("textbox", { name: "Seed" });
    await seed.fill("Outpost Tests 1");
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Found the settlement" }).tap();

    // The first visit: a storehouse, two households and a well, and what to do first.
    await expect(page.getByText(/build a woodcutter, then send its logs to the storehouse/)).toBeVisible();
    await expect(page.getByText("outpost-tests-1", { exact: true })).toBeVisible();
    await expect(page.getByText(/^8 people ·/)).toBeVisible();
    const buildings = page.getByRole("region", { name: "Buildings" });
    await expect(buildings.getByRole("button")).toHaveCount(4);
    await expect(buildings.getByRole("button", { name: /^Storehouse ·/ })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // A meadow square with woods beside it, read from the squares' own names: one well inside the
    // view, its every neighbour in view too, so that it is not cut off at the edge.
    const land = page.getByRole("group", { name: /^The land, 48 squares by 48/ });
    const names = await land.getByRole("button").evaluateAll((squares) => squares.map((square) => square.getAttribute("aria-label") ?? ""));
    const ground = new Map<string, string>();
    for (const name of names) {
      const found = /^Column (\d+), row (\d+), (.+)$/.exec(name);
      if (found) ground.set(`${found[1]},${found[2]}`, found[3]!);
    }
    const spot = [...ground.entries()].find(([at, what]) => {
      if (what !== "meadow") return false;
      const [x, y] = at.split(",").map(Number) as [number, number];
      const around = [-2, -1, 0, 1, 2].flatMap((dx) => [-2, -1, 0, 1, 2].map((dy) => `${x + dx},${y + dy}`));
      if (!around.every((near) => ground.has(near))) return false;
      return [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => ground.get(`${x + dx},${y + dy}`) === "woods"));
    });
    expect(spot, "a meadow beside the woods in view").toBeTruthy();
    const [x, y] = spot![0].split(",");

    // Chosen, the square says what can stand on it; the woodcutter is built there.
    await land.getByRole("button", { name: `Column ${x}, row ${y}, meadow`, exact: true }).tap();
    const meadow = page.getByRole("region", { name: "Meadow" });
    await expect(meadow.getByText(`Column ${x}, row ${y}`, { exact: true })).toBeVisible();
    const row = meadow.getByRole("listitem").filter({ has: page.getByText("Woodcutter", { exact: true }) });
    await expect(row).toContainText(/logs a day/);
    await row.getByRole("button", { name: "Build" }).tap();
    await expect(page.getByText("Built a woodcutter.")).toBeAttached();
    const built = page.getByRole("region", { name: "Woodcutter" });
    await expect(built.getByText(`Column ${x}, row ${y}`, { exact: true })).toBeVisible();
    await expect(buildings.getByRole("button")).toHaveCount(5);
    await expect(land.getByRole("button", { name: new RegExp(`^Column ${x}, row ${y}, Woodcutter`) })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Kept on the server: the same settlement after a reload.
    await page.reload();
    await expect(page.getByText("outpost-tests-1", { exact: true })).toBeVisible();
    await expect(buildings.getByRole("button", { name: new RegExp(`^Woodcutter · ${x}, ${y}`) })).toBeVisible();

    // Start again, which asks first, and is back at founding.
    await page.getByRole("button", { name: "Start again" }).tap();
    const confirm = page.getByRole("alertdialog", { name: "Start the settlement again?" });
    await confirm.getByRole("button", { name: "Start again" }).tap();
    await expect(page.getByRole("button", { name: "Found the settlement" })).toBeVisible();

    await api(page, "DELETE", "/api/games/steading");
    expect(errors).toEqual([]);
  });
});
