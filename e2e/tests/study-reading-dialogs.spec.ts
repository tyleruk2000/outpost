/**
 * The menus and dialogs of the reading and people screens: each opened from the keyboard,
 * checked with axe in both themes while open, closed with Escape, and focus back on what
 * opened it (study-reading.ts seeds them).
 */
import type { Locator, Page } from "@playwright/test";
import { accessibilityInBothThemes } from "./a11y";
import { expect, test } from "./fixtures";
import { seed } from "./study-reading";

interface Case {
  name: string;
  address: string;
  /** What opens it. */
  opener: (page: Page) => Locator;
  /** Steps after the opener, for a dialog reached through a menu. */
  choose?: (page: Page) => Promise<void>;
  /** Where focus goes back to when it is not the opener (a dialog opened from a menu goes back to the menu's button). */
  backTo?: (page: Page) => Locator;
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test.describe(`the reading and people dialogs at ${viewport.width} wide`, () => {
    test.use({ viewport });

    test("open by keyboard, pass axe, close with Escape and give focus back", async ({ page }) => {
      test.setTimeout(600_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      const seeded = await seed(page.request);
      const pageActions = (p: Page) => p.getByRole("button", { name: "Page actions" });
      const cases: Case[] = [
        { name: "note actions menu", address: `/notes/${seeded.note}`, opener: pageActions },
        {
          name: "move a page",
          address: `/notes/${seeded.note}`,
          opener: pageActions,
          choose: (p) => p.getByRole("menuitem", { name: /^Move to…/ }).click(),
          backTo: pageActions,
        },
        {
          name: "encrypt a page",
          address: `/notes/${seeded.note}`,
          opener: pageActions,
          choose: (p) => p.getByRole("menuitem", { name: /Encrypt this page/ }).click(),
          backTo: pageActions,
        },
        {
          name: "notes menu",
          address: "/notes",
          opener: (p) => p.getByRole("button", { name: "Import, export, templates and trash" }),
        },
        {
          name: "contact menu",
          address: `/contacts/${seeded.contact}`,
          opener: (p) => p.getByRole("button", { name: "More to do with Morwenna Trelawny" }),
        },
        {
          name: "delete a contact",
          address: `/contacts/${seeded.contact}`,
          opener: (p) => p.getByRole("button", { name: "More to do with Morwenna Trelawny" }),
          choose: (p) => p.getByRole("menuitem", { name: "Delete contact" }).click(),
          backTo: (p) => p.getByRole("button", { name: "More to do with Morwenna Trelawny" }),
        },
        {
          name: "contacts menu",
          address: "/contacts",
          opener: (p) => p.getByRole("button", { name: "More to do with contacts" }),
        },
        {
          name: "message menu",
          address: "/messages",
          opener: (p) => p.getByRole("button", { name: /^What to do with Sam's message/ }),
        },
        {
          name: "library type filter",
          address: "/library",
          opener: (p) =>
            p
              .getByRole("combobox", { name: /Type/ })
              .or(p.getByRole("button", { name: /^Type/ }))
              .first(),
        },
      ];
      const found: string[] = [];
      for (const item of cases) {
        await page.goto(item.address);
        const opener = item.opener(page);
        await opener.waitFor({ timeout: 15_000 });
        await opener.focus();
        await page.keyboard.press("Enter");
        if (item.choose) await item.choose(page);
        const open = page.locator('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]').first();
        await expect(open, `${item.name} opens`).toBeVisible();
        found.push(...(await accessibilityInBothThemes(page, `${item.address} (${item.name})`)));
        await page.keyboard.press("Escape");
        await expect(open, `${item.name} closes with Escape`).toBeHidden();
        const back = (item.backTo ?? item.opener)(page);
        await expect(back, `focus goes back after ${item.name}`).toBeFocused();
      }
      expect(found).toEqual([]);
    });
  });
}
