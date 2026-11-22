/**
 * The tools on a phone with the text at 200% (a root font size of 32 px): none scrolls sideways. Tabbing
 * through a long calculator never leaves the focus under the top bar or the bar of screens (WCAG 2.4.11).
 * The unit switches and tab names are at least 44 px each way, and a checkbox or a switch can be pressed
 * anywhere in the 44 px square around it on a touch screen, though it is drawn smaller.
 */
import { expect, test, watchForErrors } from "./fixtures";

const TOOLS = [
  "/tools/water",
  "/tools/outdoors",
  "/tools/radio",
  "/tools/building",
  "/tools/cooking",
  "/tools/rations",
  "/tools/power",
  "/tools/qr",
  "/tools/solar-clock",
  "/tools/compass",
  "/tools/night-sky",
  "/tools/celestial-navigation",
  "/tools/tides",
  "/tools/garden",
];

test.describe("tools with large text, on a phone", () => {
  test("none scrolls sideways with the text at 200%", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    // A home place, so that the screens that need one show their answers rather than asking for it.
    await page.goto("/");
    await page.request.fetch("/api/maps/markers", {
      method: "POST",
      headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
      data: JSON.stringify({ name: "Large-text home", lat: 42.3601, lon: -71.0589, icon: "home" }),
    });
    const wide: string[] = [];
    for (const path of TOOLS) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const over = await page.evaluate(async () => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const width = document.documentElement.clientWidth;
        // The bar of screens at the foot belongs to the app's frame, not to the tool; a table in a box of its own
        // that scrolls sideways (reached by Tab) is allowed to.
        const what = [...document.querySelectorAll("main *")]
          .filter((el) => !el.closest("svg, .sr-only, .truncate, .overflow-x-auto"))
          .filter((el) => el.getBoundingClientRect().right > width + 1)
          .filter((el) => ![...el.children].some((child) => child.getBoundingClientRect().right > width + 1))
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()} “${(el.textContent ?? "").trim().slice(0, 30)}”`);
        return what;
      });
      if (over.length) wide.push(`${path}: ${over.join(", ")}`);
    }
    expect(wide).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Tab never leaves the focus under the bars, and the unit switches and tabs are a finger wide", async ({ page }) => {
    await page.goto("/tools/building");
    await expect(page.getByRole("heading", { level: 1, name: "Building" })).toBeVisible();
    const under: string[] = [];
    for (let index = 0; index < 80; index++) {
      await page.keyboard.press("Tab");
      const hidden = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.closest("main")) return null;
        const box = el.getBoundingClientRect();
        const top = document.querySelector("header.bg-spine")?.getBoundingClientRect().bottom ?? 0;
        const bottom = document.querySelector('nav[aria-label="Main"]')?.getBoundingClientRect().top ?? innerHeight;
        return box.top < top - 1 || box.bottom > bottom + 1
          ? (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).slice(0, 40)
          : null;
      });
      if (hidden) under.push(hidden);
    }
    expect(under).toEqual([]);

    const units = page.locator("main button[role=radio]");
    expect(await units.count()).toBeGreaterThan(0);
    for (const box of await units.evaluateAll((all) => all.map((el) => el.getBoundingClientRect()))) {
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    await page.goto("/tools/solar-clock");
    const now = page.getByRole("tab", { name: "Now", exact: true });
    const tab = (await now.boundingBox())!;
    expect(Math.min(tab.width, tab.height)).toBeGreaterThanOrEqual(44);
  });

  test("a checkbox and a switch take a press anywhere in the 44 px square around them", async ({ page }) => {
    /** For each point 20 px out from the control's centre, whether a press there lands on the control. */
    const reach = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((control) => {
          control.scrollIntoView({ block: "center" });
          const box = control.getBoundingClientRect();
          const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
          return [
            [0, -20],
            [0, 20],
            [-20, 0],
            [20, 0],
          ].map(([dx, dy]) => {
            const at = document.elementFromPoint(x + (dx ?? 0), y + (dy ?? 0));
            const label = at?.closest("label");
            return { dx, dy, hits: at === control || control.contains(at) || (!!label && label.htmlFor === control.id) };
          });
        });

    await page.goto("/tools/rations");
    const checkbox = "main button[role=checkbox]";
    await expect(page.locator(checkbox).first()).toBeVisible();
    expect((await reach(checkbox)).filter((point) => !point.hits)).toEqual([]);

    await page.goto("/prepare/nuclear");
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    const toggle = "main button[role=switch]";
    await expect(page.locator(toggle).first()).toBeVisible();
    expect((await reach(toggle)).filter((point) => !point.hits)).toEqual([]);
  });
});
