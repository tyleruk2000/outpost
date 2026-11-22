/**
 * Keyboard focus on the long Prepare forms on a phone: whatever Tab moves to is scrolled
 * clear of the top bar, the bar of screens and the bar with Save at the foot of the form
 * (WCAG 2.4.11), and that bar sits on the bar of screens rather than under it.
 *
 * Chromium with a phone's size, not a real phone: the home indicator's room
 * (env(safe-area-inset-bottom)) is nought here, and was not tried on an iPhone.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

/** Tabs through the screen and lists each stop that something else lies over. */
async function coveredStops(page: Page, stops: number): Promise<string[]> {
  const covered: string[] = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    const found = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body || !element.closest("main")) return null;
      const box = element.getBoundingClientRect();
      // The middle of the element, and its top and bottom edges just inside.
      const points = [box.top + 2, box.top + box.height / 2, box.bottom - 2].map((y) =>
        document.elementFromPoint(box.left + box.width / 2, y),
      );
      const over = points.find((hit) => hit && !element.contains(hit) && !hit.contains(element));
      if (!over) return null;
      const name = (element.getAttribute("aria-label") || element.textContent || element.id || element.tagName).trim().slice(0, 40);
      return `${name}: under ${over.closest("[data-save-bar], nav, header")?.tagName.toLowerCase() ?? over.tagName.toLowerCase()}`;
    });
    if (found) covered.push(found);
  }
  return covered;
}

test.describe("Focus on the Prepare forms on a phone", () => {
  test("a medical sheet and Keeping in touch keep what has the focus in sight", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    const { sheet } = await api(page, "POST", "/api/medical-sheets", {
      name: "Focus test",
      record: {
        allergies: [{ id: "a", what: "Penicillin", reaction: "Rash" }],
        conditions: [{ id: "c", what: "Asthma", note: "" }],
        medicines: [{ id: "m", name: "Salbutamol", dose: "Two puffs", when: "When needed", keptWhere: "Coat pocket" }],
      },
    });

    await page.goto(`/prepare/medical/${sheet.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Medical sheet: Focus test" })).toBeVisible();
    // The bar with Save sits on the bar of screens, not under it.
    const bar = (await page.locator("[data-save-bar]").boundingBox())!;
    const nav = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
    expect(Math.round(bar.y + bar.height)).toBeLessThanOrEqual(Math.round(nav.y) + 1);
    expect(await coveredStops(page, 40)).toEqual([]);

    await page.goto("/prepare/keeping-in-touch");
    await expect(page.getByRole("heading", { level: 1, name: "Keeping in touch" })).toBeVisible();
    expect(await coveredStops(page, 40)).toEqual([]);

    await page.goto("/prepare/supplies?view=household");
    await expect(page.getByRole("tab", { name: "Household", selected: true })).toBeVisible();
    expect(await coveredStops(page, 40)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("A plan in use on the smallest phone", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("wraps a step that holds a web address", async ({ page }) => {
    await page.goto("/");
    const { plan } = await api(page, "POST", "/api/emergency-plans", {
      name: "Wrapping test",
      kind: "other",
      kindText: "",
      templateId: null,
      emergencyNumber: "999",
      reviewEveryDays: 180,
      body: {
        steps: [{ id: "s1", phase: "after", text: "Read https://www.redcross.org.uk/get-help/prepare-for-emergencies/power-cut first" }],
      },
    });
    await page.goto(`/prepare/plans/${plan.id}/use`);
    await expect(page.getByText(/redcross\.org\.uk/)).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("Supplies with the text at 200% on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("keeps the search field and both choices on the screen", async ({ page }) => {
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
    await page.goto("/");
    await api(page, "POST", "/api/supplies/items", { name: "Wide text beans", category: "food", quantity: 2, location: "Pantry" });
    await page.goto("/prepare/supplies");
    const search = page.getByRole("searchbox", { name: "Find in supplies" });
    await expect(search).toBeVisible();
    expect((await search.boundingBox())!.width).toBeGreaterThan(200);
    const keptIn = (await page.getByRole("combobox", { name: "Kept in" }).boundingBox())!;
    expect(keptIn.x + keptIn.width).toBeLessThanOrEqual(1280);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("Prepare at 320 with the Largest text", () => {
  test.use({ viewport: { width: 320, height: 568 } });
  test("no screen scrolls sideways", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem("outpost.textSize", "largest");
      localStorage.setItem("outpost.board.name", "Sam");
    });
    await page.goto("/");
    await api(page, "POST", "/api/routine-checks/suggested");
    await api(page, "POST", "/api/event-log", { author: "Sam", text: "Called the network operator. They expect the power back by six." });
    await api(page, "POST", "/api/supplies/items", {
      name: "Tinned tomatoes",
      category: "food",
      quantity: 2,
      unit: "tin",
      location: "Pantry",
    });
    await api(page, "POST", "/api/supplies/shopping/work-out");
    await api(page, "PUT", "/api/supplies/household", {
      daysWanted: 3,
      energyTable: null,
      drinkingLitres: 3,
      allUsesLitres: 7.5,
      waterBasis: "drinking",
      members: [
        { kind: "pet", name: "Biscuit", band: null, sex: null, kcalPerDay: 400, drinkingLitres: 0.5, allUsesLitres: null, note: "" },
      ],
    });
    await api(page, "POST", "/api/medical-sheets", { name: "Largest text", record: { allergies: [{ id: "a", what: "Penicillin" }] } });
    for (const where of [
      "/prepare/checks",
      "/prepare/log",
      "/prepare/medical",
      "/prepare/keeping-in-touch",
      "/prepare/supplies",
      "/prepare/supplies?view=shopping",
      "/prepare/supplies?view=household",
    ]) {
      await page.goto(where);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await sideways(page), where).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("Tabs, fields and leaving with changes not saved", () => {
  test("Tab goes from the units to the chosen weather tab after a tab was pressed, never to the row of tabs", async ({ page }) => {
    await page.goto("/prepare/weather");
    await page.getByRole("tab", { name: "Warnings" }).click();
    await page.getByRole("radio", { name: "°F" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tab", { name: "Warnings" })).toBeFocused();
  });

  test("a text field's focus is a 2 px ring in the focus colour, in light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/prepare/log");
      const field = page.getByRole("textbox").first();
      await field.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(field).toBeFocused();
      const read = () =>
        field.evaluate((element) => {
          const probe = document.createElement("span");
          probe.style.color = "var(--focus)";
          document.body.append(probe);
          const focusColour = getComputedStyle(probe).color;
          probe.remove();
          const ring = getComputedStyle(element).boxShadow;
          return ring.includes("0px 0px 0px 2px") && ring.includes(focusColour) ? "ring" : ring;
        });
      // The ring comes in over 150 ms.
      await expect.poll(read, { message: scheme }).toBe("ring");
    }
  });

  test("asks before leaving a medical sheet with changes not saved", async ({ page }) => {
    await page.goto("/");
    const { sheet } = await api(page, "POST", "/api/medical-sheets", { name: "Leaving test", record: {} });
    await page.goto(`/prepare/medical/${sheet.id}`);
    await page.getByRole("textbox", { name: "Anything else to know (optional)" }).fill("Wears glasses.");
    await page.getByRole("link", { name: "Medical sheets" }).first().tap();
    const ask = page.getByRole("alertdialog", { name: "Leave without saving?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Stay here" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Medical sheet: Leaving test" })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).tap();
    await expect(page.getByText(/^Saved /)).toBeVisible();
    await page.getByRole("link", { name: "Medical sheets" }).first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Medical sheets" })).toBeVisible();
  });
});

test.describe("Large text on a wide screen and the smallest phone", () => {
  test("Nuclear preparedness at 200% on a wide screen puts the map above the panel, its zoom in reach", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
    await page.goto("/prepare/nuclear");
    const zoom = page.getByRole("button", { name: "Zoom in" });
    await expect(zoom).toBeVisible({ timeout: 20_000 });
    const box = (await zoom.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  });

  test("the passphrase's Show button is inside the encrypt dialog at 320 with the Largest text", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => localStorage.setItem("outpost.textSize", "largest"));
    await page.goto("/");
    const { sheet } = await api(page, "POST", "/api/medical-sheets", { name: "Passphrase test", record: {} });
    await page.goto(`/prepare/medical/${sheet.id}`);
    await page.getByRole("button", { name: "Encrypt this sheet" }).tap();
    const show = page.getByRole("dialog").getByRole("button", { name: "Show passphrase" }).first();
    await show.scrollIntoViewIfNeeded();
    const box = (await show.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });
});
