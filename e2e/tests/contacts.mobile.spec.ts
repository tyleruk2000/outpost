import { api, expect, test, watchForErrors } from "./fixtures";

/** Contacts at phone width: nothing spills sideways, a call is one touch away, and the large-type view fills the screen. */
test.describe("contacts on a phone", () => {
  test("fits the list, a contact, the editor and the import at phone width", async ({ page }) => {
    const errors = watchForErrors(page);
    const made = await api(page, "POST", "/api/contacts", {
      name: { prefix: "", given: "Margaret", additional: "Wilhelmina", family: "Featherstonehaugh-Cholmondeley", suffix: "" },
      organisation: "Borrowdale and District Mountain Rescue Association",
      phones: [
        { value: "+44 7700 900123", label: "mobile" },
        { value: "01632 960188", label: "out of hours, ask for the duty doctor" },
      ],
      emails: [{ value: "margaret.featherstonehaugh-cholmondeley@a-very-long-domain-name.example", label: "work" }],
      addresses: [
        {
          label: "home",
          street: "The Old Forge\n4 Kästner Lane",
          locality: "Ambleside",
          region: "Cumbria",
          postcode: "LA22 9ZZ",
          country: "United Kingdom",
        },
      ],
      isEmergency: true,
      emergencyNote: "Two doors up. Has a spare key and a generator.",
      callsign: "M0ZOE",
      channels: [{ frequency: "145.500 MHz", mode: "FM calling, on the hour" }],
    });
    const id = made.contact.id as string;
    try {
      const fits = async (what: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `sideways overflow on ${what}`).toBeLessThanOrEqual(1);
      };

      await page.goto("/contacts");
      const call = page.getByRole("link", { name: /^Call Margaret/ });
      await expect(call).toHaveAttribute("href", "tel:+447700900123");
      const box = await call.boundingBox();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
      await fits("the list");

      await page.getByRole("link", { name: /^Margaret Wilhelmina/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Featherstonehaugh");
      // On a phone the contact takes the place of the list, with a way back.
      await expect(page.getByRole("searchbox", { name: "Find a contact" })).toBeHidden();
      await expect(page.getByRole("link", { name: "Contacts", exact: true }).first()).toBeVisible();
      for (const name of ["Call +44 7700 900123", "Text +44 7700 900123", "Copy +44 7700 900123"]) {
        const target = await page.getByRole(name.startsWith("Copy") ? "button" : "link", { name }).boundingBox();
        expect(Math.min(target!.width, target!.height), name).toBeGreaterThanOrEqual(44);
      }
      await fits("a contact");

      await page.getByRole("link", { name: "Large type" }).click();
      await expect(page.getByRole("link", { name: "Close large type" })).toBeVisible();
      const number = page.getByRole("link", { name: "Call +44 7700 900123" });
      await expect(number).toBeVisible();
      const size = await number
        .locator("span")
        .first()
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(size).toBeGreaterThanOrEqual(30);
      await fits("large type");

      await page.goto(`/contacts/${id}/edit`);
      await expect(page.getByRole("button", { name: "Save contact" })).toBeVisible();
      await fits("the editor");

      await page.goto("/contacts/import");
      await expect(page.getByRole("button", { name: "Choose a vCard file" })).toBeVisible();
      await fits("the import");

      await page.goto("/contacts/emergency");
      await expect(page.getByTestId("sheet-preview")).toBeVisible();
      await fits("the emergency sheet");

      await page.goto("/contacts/phones");
      await expect(page.getByText("From Outpost to the phone, and never back.")).toBeVisible();
      await fits("the page about phones");
    } finally {
      await api(page, "DELETE", `/api/contacts/${id}`);
    }
    expect(errors).toEqual([]);
  });
});
