/**
 * Every drop-down inside a dialog on the HF screens, by touch at phone width. The list
 * of a drop-down is put at the end of the page; it must be drawn over the dialog it was
 * opened from, where a finger can reach it. (It was not: see components/ui/menu.tsx.)
 */
import type { Locator, Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Opens each drop-down of a dialog in turn, checks that its list is what is on top at the
 * middle of an option, and takes the last option. Says how many drop-downs it went through.
 */
async function pickFromEach(page: Page, dialog: Locator): Promise<string[]> {
  const names: string[] = [];
  // Counted again each time round: what is chosen in one may add or take away another.
  for (let index = 0; index < (await dialog.getByRole("combobox").count()); index++) {
    const trigger = dialog.getByRole("combobox").nth(index);
    const labelled = await trigger.getAttribute("aria-label");
    const name = (labelled ?? (await dialog.locator(`label[for="${await trigger.getAttribute("id")}"]`).textContent()) ?? "").trim();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.tap();
    const option = page.getByRole("option").last();
    await expect(option, name).toBeVisible();
    const onTop = await option.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    });
    expect(onTop, `the list of “${name}” is drawn over the dialog`).toBe(true);
    // The option's own words, without the smaller line some have under them.
    const chosen = ((await option.locator("span").first().textContent()) ?? "").trim();
    await option.tap();
    await expect(page.getByRole("listbox"), name).toHaveCount(0);
    // A drop-down that only hands its choice on (a saved place, a radio profile) goes back to its prompt.
    if ((await trigger.getAttribute("data-placeholder")) === null) await expect(trigger, name).toContainText(chosen);
    names.push(name);
  }
  return names;
}

test.describe("Drop-downs inside dialogs on the HF screens, on a phone", () => {
  test("a plan's station: radio, antenna and noise can each be chosen", async ({ page }) => {
    const errors = watchForErrors(page);
    const { radio } = await api(page, "POST", "/api/radio/profiles/radios", {
      name: "Dialog test radio",
      model: "",
      powerWatts: 10,
      minMhz: 3.5,
      maxMhz: 30,
      modes: ["ssb"],
      receiver: "",
      notes: "",
    });
    const { plan } = await api(page, "POST", "/api/radio/communication-plans", {
      name: "Dialog test plan",
      notes: "",
      stations: [],
      date: "2026-11-16",
      fromUtc: 8,
      toUtc: 16,
      bands: ["40m"],
      mode: "ssb",
      requiredSnrDb: null,
      referenceBandwidthHz: null,
      solar: { source: "table" },
      links: [],
    });
    await page.goto(`/radio/plans/${plan.id}`);
    await page.getByRole("button", { name: "Add a station" }).first().tap();
    const dialog = page.getByRole("dialog", { name: "Add a station" });
    await expect(dialog).toBeVisible();
    const names = await pickFromEach(page, dialog);
    expect(names).toEqual(expect.arrayContaining(["Radio", "Noise where this station listens"]));
    // The antenna has a chooser of its own (grouped, with a box to type in): the same check, by touch.
    const antenna = dialog.getByRole("button", { name: "Antenna", exact: true });
    await antenna.scrollIntoViewIfNeeded();
    await antenna.tap();
    const last = page.getByRole("listbox", { name: "Antennas" }).getByRole("option").last();
    await last.scrollIntoViewIfNeeded();
    const onTop = await last.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    });
    expect(onTop, "the antenna list is drawn over the dialog").toBe(true);
    await last.tap();
    await expect(page.getByRole("listbox", { name: "Antennas" })).toHaveCount(0);
    await expect(antenna).toHaveText("Isotropic (no pattern), 0 dBi");
    // The radio chosen filled in its power: the choice reached the form.
    await expect(dialog.getByLabel("Transmitter power, watts")).toHaveValue("10");
    await dialog.getByRole("button", { name: "Cancel" }).tap();
    await api(page, "DELETE", `/api/radio/communication-plans/${plan.id}`);
    await api(page, "DELETE", `/api/radio/profiles/radios/${radio.id}`);
    expect(errors).toEqual([]);
  });

  test("an antenna profile: its kind and the ground under it can each be chosen", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/radio/propagation?tab=equipment");
    await page.getByRole("button", { name: "Add an antenna" }).first().tap();
    const dialog = page.getByRole("dialog", { name: "Add an antenna" });
    await expect(dialog).toBeVisible();
    const names = await pickFromEach(page, dialog);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names).toContain("Kind");
    await dialog.getByRole("button", { name: "Cancel" }).tap();
    expect(errors).toEqual([]);
  });
});
