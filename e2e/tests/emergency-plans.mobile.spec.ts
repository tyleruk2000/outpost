/**
 * An emergency plan on a phone: made from the power cut template, a contact linked from
 * Contacts and a saved place picked from a drop-down inside a dialog, the supplies set
 * beside the inventory, the plan started and steps ticked, and the fridge sheet made as
 * a PDF and added to the library, where a name in another script is found by search.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Emergency plans on a phone", () => {
  test("makes a power cut plan, links a contact and a place, compares supplies, uses it and makes the fridge sheet", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    for (const plan of (await api(page, "GET", "/api/emergency-plans")).plans as Array<{ id: string }>)
      await api(page, "DELETE", `/api/emergency-plans/${plan.id}`);
    await api(page, "POST", "/api/contacts", {
      kind: "person",
      name: { prefix: "", given: "Ελένη", additional: "", family: "Παπαδοπούλου", suffix: "" },
      phones: [{ value: "+44 7700 900461", label: "mobile" }],
    });
    await api(page, "POST", "/api/maps/markers", { name: "Fellside village hall", lat: 54.43218, lon: -2.96311 });
    await api(page, "POST", "/api/supplies/items", { name: "LED torch", category: "equipment", quantity: 2 });

    // Reached from the More sheet, under Preparedness.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/prepare/plans"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Emergency plans" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No emergency plans yet" })).toBeVisible();

    // From the power cut template.
    await page.getByRole("button", { name: "New plan" }).first().tap();
    const choose = page.getByRole("dialog", { name: "New emergency plan" });
    await choose.getByRole("radio", { name: /^Power cut/ }).tap();
    await expect(choose.getByLabel("Name")).toHaveValue("Power cut");
    await choose.getByRole("button", { name: "Make the plan" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Power cut" })).toBeVisible();
    // Each step says where its words come from.
    await expect(page.locator("summary", { hasText: /^From UK Government/ }).first()).toBeVisible();
    await expect(page.getByTestId("template-licences")).toContainText("Open Government Licence v3.0");
    await expect(page.getByText(/In a real emergency, follow the emergency services and official warnings/).first()).toBeVisible();

    // A contact, linked from Contacts.
    await page.getByRole("button", { name: "Add a contact" }).tap();
    const picker = page.getByRole("dialog", { name: "Add a contact" });
    await picker.getByLabel("Find in Contacts").fill("Παπαδοπούλου");
    await picker.getByRole("button", { name: /Ελένη Παπαδοπούλου/ }).tap();
    await expect(picker).toBeHidden();
    await expect(page.getByRole("link", { name: "Ελένη Παπαδοπούλου" })).toBeVisible();
    await page.getByLabel("Out-of-area contact").tap();

    // A place to meet, picked from a drop-down inside a dialog.
    await page.getByRole("button", { name: "Add a place" }).tap();
    const placeDialog = page.getByRole("dialog", { name: "Add a place to meet" });
    await placeDialog.getByRole("combobox", { name: "Saved place" }).tap();
    const hall = page.getByRole("option", { name: "Fellside village hall" });
    await expect(hall).toBeVisible();
    const onTop = await hall.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    });
    expect(onTop, "the list of places is drawn over the dialog").toBe(true);
    await hall.tap();
    await placeDialog.getByRole("button", { name: "Add place" }).tap();
    await expect(placeDialog).toBeHidden();
    await expect(page.getByRole("link", { name: "Fellside village hall" })).toHaveAttribute("href", "/maps?lat=54.43218&lon=-2.96311&z=15");

    // The supplies beside the inventory: the torch is held, the water is not.
    const supplies = page.getByRole("list", { name: "Supplies this plan needs" });
    await expect(supplies.getByRole("listitem").filter({ hasText: "In stock" }).first()).toBeVisible();
    await expect(supplies.getByRole("listitem").filter({ hasText: "Missing" }).first()).toBeVisible();
    await expect(page.getByText("Food held")).toBeVisible();
    await page.getByRole("button", { name: /to the shopping list$/ }).tap();
    await expect(page.getByText(/added to the shopping list/)).toBeVisible();
    const shopping = await api(page, "GET", "/api/supplies/shopping");
    expect((shopping.lines as Array<{ name: string }>).some((line) => line.name === "Bottled water")).toBe(true);
    expect(await overflow(), "sideways overflow on the plan").toBeLessThanOrEqual(0);
    await expect(page.getByText("Saved.")).toBeVisible();

    // Use it: start, tick two steps, and see each done with its time.
    await page.getByRole("link", { name: "Use now" }).tap();
    await expect(page.getByRole("link", { name: "Call the emergency services: 999" })).toHaveAttribute("href", "tel:999");
    await expect(page.getByRole("link", { name: "Call Ελένη Παπαδοπούλου: +44 7700 900461" })).toHaveAttribute("href", "tel:+447700900461");
    await page.getByRole("button", { name: "Start using this plan" }).tap();
    await expect(page.getByText(/In use since/)).toBeVisible();
    const during = page.locator("section", { has: page.getByRole("heading", { name: "During" }) });
    // A finger presses the whole row, which is the checkbox's label.
    const rows = during.locator("label");
    await rows.nth(0).tap();
    await expect(during.getByRole("checkbox").nth(0)).toBeChecked();
    await rows.nth(1).tap();
    await expect(during.getByRole("checkbox").nth(1)).toBeChecked();
    await expect(page.getByText(/2 of \d+ steps done/)).toBeVisible();
    await expect(during.getByText(/^Done at \d\d:\d\d$/)).toHaveCount(2);
    const target = (await rows.first().boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(), "sideways overflow in use").toBeLessThanOrEqual(0);
    // Kept on the server: a reload shows the same.
    await page.reload();
    await expect(page.getByText(/2 of \d+ steps done/)).toBeVisible();

    // The fridge sheet, added to the library after saying whose details it holds.
    await page.getByRole("link", { name: "The whole plan" }).tap();
    await page.getByRole("link", { name: "Cards to print" }).tap();
    await page.getByRole("radio", { name: "Fridge sheet" }).tap();
    await expect(page.getByTestId("cards-preview")).toBeVisible();
    await expect(page.getByRole("link", { name: "Save as PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Add to library" }).tap();
    const ask = page.getByRole("alertdialog", { name: "Put the household's details in the library?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Add to library" }).tap();
    const status = page.getByTestId("pdf-status");
    await expect(status).toContainText("Added to the library");
    const link = status.getByRole("link", { name: /^Fridge sheet, Power cut, / });
    const documentId = (await link.getAttribute("href"))!.split("/").pop()!;
    await expect
      .poll(async () => (await api(page, "GET", `/api/documents/${documentId}`)).document.extraction, { timeout: 30_000 })
      .toBe("done");

    // The number and the name in Greek are in the file's text, and search finds the sheet by the name.
    const found = await api(page, "GET", `/api/search?q=${encodeURIComponent("Παπαδοπούλου")}&kinds=document&mode=keyword`);
    expect((found.results as Array<{ entityId: string }>).some((result) => result.entityId === documentId)).toBe(true);
    const byNumber = await api(page, "GET", `/api/search?q=${encodeURIComponent('"7700 900461"')}&kinds=document&mode=keyword`);
    expect((byNumber.results as Array<{ entityId: string }>).some((result) => result.entityId === documentId)).toBe(true);
    expect(errors).toEqual([]);
  });
});
