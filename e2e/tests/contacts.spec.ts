import { api, expect, test, watchForErrors } from "./fixtures";

/**
 * Contacts from end to end: a file from a phone comes in, a person is found and marked
 * for an emergency, the sheet prints, and the contacts go out again as a file. Every
 * person here is made up.
 */
const card = (lines: string[]) => ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD", ""].join("\r\n");
const PHONE_EXPORT = [
  card([
    "UID:e2e-contact-ada",
    "N:Okafor;Adaeze;;Dr.;",
    "FN:Dr. Adaeze Okafor",
    "ORG:Fell Road Surgery",
    "TEL;type=CELL:+44 7700 900123",
    "item1.TEL:01632 960188",
    "item1.X-ABLabel:out of hours",
    "EMAIL;type=WORK:adaeze.okafor@fellroad.example",
    "ADR;type=WORK:;;12 Fell Road;Keswick;Cumbria;CA12 9ZZ;UK",
    "NOTE:Rings back within the hour; leave a message.",
    "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEm",
  ]),
  card(["UID:e2e-contact-zoe", "N:Łukasiewicz;Zoë;;;", "FN:Zoë Łukasiewicz", "TEL;type=CELL:07700 900456"]),
  card(["FN:"]),
].join("");

async function removeTestContacts(page: import("@playwright/test").Page) {
  for (const name of ["Okafor", "Łukasiewicz"]) {
    const found = await api(page, "GET", `/api/contacts?q=${encodeURIComponent(name)}`);
    for (const contact of found.contacts) await api(page, "DELETE", `/api/contacts/${contact.id}`);
  }
}

test.describe("contacts", () => {
  test.afterEach(async ({ page }) => {
    await removeTestContacts(page);
    await api(page, "PATCH", "/api/settings", { "contacts.carddav": false });
  });

  test("brings in a phone's file, finds a contact, marks it for an emergency, prints the sheet and exports", async ({ page }) => {
    const errors = watchForErrors(page);
    await removeTestContacts(page);
    await page.goto("/contacts");
    await expect(page.getByRole("heading", { name: "Contacts", level: 1 })).toBeVisible();
    // Said once, in plain words: there are no accounts to keep contacts apart.
    await expect(page.getByText(/There are no accounts to keep them apart/i)).toHaveCount(1);

    // ── A file from a phone: read first, nothing changed ──
    await page.getByRole("button", { name: "More to do with contacts" }).click();
    await page.getByRole("menuitem", { name: "Bring in from a phone or a file" }).click();
    await expect(page.getByRole("heading", { name: "Bring in contacts", level: 1 })).toBeVisible();
    await page.getByLabel("vCard file").setInputFiles({ name: "phone.vcf", mimeType: "text/vcard", buffer: Buffer.from(PHONE_EXPORT) });
    await expect(page.getByText("Nothing has been changed yet.")).toBeVisible();
    await expect(page.getByText("2 contacts are new.")).toBeVisible();
    await expect(page.getByText("1 picture in the file was left out: Outpost keeps no photos of people.")).toBeVisible();
    await expect(page.getByText("It has no name, number or address.")).toBeVisible();
    expect((await api(page, "GET", "/api/contacts?q=Okafor")).total).toBe(0);

    await page.getByRole("button", { name: "Add 2 contacts" }).click();
    await expect(page.getByText("Added 2 contacts.")).toBeVisible();
    await page.getByRole("link", { name: "See the contacts" }).click();

    // ── Found as it is typed, without its accents, and by part of a number ──
    const find = page.getByRole("searchbox", { name: "Find a contact" });
    await find.fill("lukasiewicz");
    await expect(page.getByRole("link", { name: /^Zoë Łukasiewicz/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Dr\. Adaeze Okafor/ })).toBeHidden();
    await find.fill("960188");
    await page.getByRole("link", { name: /^Dr\. Adaeze Okafor/ }).click();

    // ── One contact: every number a touch from a call ──
    await expect(page.getByRole("heading", { name: "Dr. Adaeze Okafor", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Call +44 7700 900123" })).toHaveAttribute("href", "tel:+447700900123");
    await expect(page.getByRole("link", { name: "Text 01632 960188" })).toHaveAttribute("href", "sms:01632960188");
    await expect(page.getByRole("link", { name: "Email adaeze.okafor@fellroad.example" })).toHaveAttribute(
      "href",
      "mailto:adaeze.okafor@fellroad.example",
    );
    await expect(page.getByText("out of hours")).toBeVisible();
    await expect(page.getByText("Rings back within the hour; leave a message.")).toBeVisible();

    // ── Marked for an emergency: listed first, and on the sheet ──
    await page.getByRole("button", { name: "More to do with Dr. Adaeze Okafor" }).click();
    await page.getByRole("menuitem", { name: "Mark for an emergency" }).click();
    await expect(page.getByText("In an emergency.", { exact: true })).toBeVisible();
    await find.fill("");
    const marked = page.getByRole("region", { name: "In an emergency" });
    await expect(marked.getByRole("link", { name: /^Dr\. Adaeze Okafor/ })).toBeVisible();

    await marked.getByRole("link", { name: "Print the sheet" }).click();
    await expect(page.getByRole("heading", { name: "Emergency sheet", level: 1 })).toBeVisible();
    const preview = page.getByTestId("sheet-preview");
    await expect(preview.getByText("Dr. Adaeze Okafor")).toBeVisible();
    await expect(preview.getByText("+44 7700 900123")).toBeVisible();
    await expect(preview.getByText("Zoë Łukasiewicz")).toHaveCount(0);

    // What the printer is given: the sheet, and nothing of the app around it.
    await page.emulateMedia({ media: "print" });
    const paper = page.locator("body > .outpost-contacts-print");
    await expect(paper).toBeVisible();
    await expect(paper.getByText("Dr. Adaeze Okafor")).toBeVisible();
    await expect(paper.getByText("01632 960188")).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeHidden();
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    // ── Out again as a file a phone can open ──
    await page.goto("/contacts");
    await page.getByRole("button", { name: "More to do with contacts" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Export all as a vCard file" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^outpost-contacts-\d{4}-\d{2}-\d{2}\.vcf$/);
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const exported = Buffer.concat(chunks).toString("utf8");
    expect(exported).toContain("VERSION:3.0");
    expect(exported).toContain("FN:Dr. Adaeze Okafor");
    expect(exported).toContain("UID:e2e-contact-ada");
    expect(exported).toContain("X-OUTPOST-EMERGENCY:1");
    expect(exported).toContain("item1.X-ABLabel:out of hours");
    expect(exported).not.toContain("PHOTO");

    // ── The same file again: Outpost knows it has these, and asks about nothing ──
    await page.goto("/contacts/import");
    await page.getByLabel("vCard file").setInputFiles({ name: "phone.vcf", mimeType: "text/vcard", buffer: Buffer.from(PHONE_EXPORT) });
    await expect(page.getByText(/2 are already here, with everything this has for them/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Nothing to bring in" })).toBeDisabled();

    // ── Found by the search across everything ──
    const search = await api(page, "GET", "/api/search?q=Adaeze");
    expect(search.results[0]).toMatchObject({ kind: "contact", title: "Dr. Adaeze Okafor" });
    expect(errors).toEqual([]);
  });

  test("shows a changed card beside the contact it would change, and changes it only when asked", async ({ page }) => {
    const errors = watchForErrors(page);
    await removeTestContacts(page);
    await page.goto("/contacts/import");
    await page.getByLabel("vCard file").setInputFiles({ name: "phone.vcf", mimeType: "text/vcard", buffer: Buffer.from(PHONE_EXPORT) });
    await page.getByRole("button", { name: "Add 2 contacts" }).click();
    await expect(page.getByText("Added 2 contacts.")).toBeVisible();

    const changed = card([
      "UID:e2e-contact-zoe",
      "N:Łukasiewicz;Zoë;;;",
      "FN:Zoë Łukasiewicz",
      "TEL;type=CELL:07700 900456",
      "TEL;type=HOME:01632 960222",
    ]);
    await page.getByRole("button", { name: "Bring in another file" }).click();
    await page.getByLabel("vCard file").setInputFiles({ name: "later.vcf", mimeType: "text/vcard", buffer: Buffer.from(changed) });
    await expect(page.getByRole("heading", { name: "Look like someone already here" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "In Outpost" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "In the file" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Leave Outpost’s as it is/ })).toBeChecked();
    await expect(page.getByRole("button", { name: "Nothing to bring in" })).toBeDisabled();

    await page.getByRole("radio", { name: /Add what is new/ }).check();
    await page.getByRole("button", { name: "Change 1 contact" }).click();
    await expect(page.getByText("Added what was new to 1 contact already here.")).toBeVisible();
    const zoe = (await api(page, "GET", "/api/contacts?q=lukasiewicz")).contacts[0];
    expect(zoe.phones.map((phone: { value: string }) => phone.value)).toEqual(["07700 900456", "01632 960222"]);
    expect(errors).toEqual([]);
  });

  test("lets a phone subscribe to the contacts once that is turned on, and never lets it write", async ({ page }) => {
    const errors = watchForErrors(page);
    await removeTestContacts(page);
    const made = await api(page, "POST", "/api/contacts", {
      name: { prefix: "", given: "Adaeze", additional: "", family: "Okafor", suffix: "" },
      phones: [{ value: "+44 7700 900123", label: "mobile" }],
    });
    const book = "/dav/addressbooks/contacts/";
    expect((await page.request.fetch(book, { method: "PROPFIND", headers: { Depth: "1" } })).status()).toBe(404);

    await page.goto("/contacts/phones");
    await expect(page.getByText("From Outpost to the phone, and never back.")).toBeVisible();
    await page.getByRole("switch", { name: "Let phones on your network subscribe to these contacts" }).click();
    await expect(page.getByText("User name", { exact: true })).toBeVisible();
    await expect(page.getByText(/There is none\. Outpost has no accounts/)).toBeVisible();

    const listing = await page.request.fetch(book, { method: "PROPFIND", headers: { Depth: "1" } });
    expect(listing.status()).toBe(207);
    expect(await listing.text()).toContain(`${book}${made.contact.id}.vcf`);
    const one = await page.request.fetch(`${book}${made.contact.id}.vcf`);
    expect(await one.text()).toContain("FN:Adaeze Okafor");
    const write = await page.request.fetch(`${book}${made.contact.id}.vcf`, { method: "DELETE" });
    expect(write.status()).toBe(403);
    expect((await api(page, "GET", `/api/contacts/${made.contact.id}`)).contact.displayName).toBe("Adaeze Okafor");
    expect(errors).toEqual([]);
  });
});
