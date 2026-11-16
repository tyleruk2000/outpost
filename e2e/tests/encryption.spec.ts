/**
 * Encryption, end to end, on localhost (which browsers treat as a secure origin, so the
 * cryptography is available). Keys are made in the page under test; the one key and the
 * messages that were not are fixtures written by GnuPG 2.5.18.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

const fixtures = path.resolve(import.meta.dirname, "../../apps/web/src/features/encryption/fixtures");
const fixture = (name: string) => fs.readFileSync(path.join(fixtures, name), "utf8");
const GNUPG_FINGERPRINT = fixture("gnupg-fingerprint.txt").trim();
const VENDOR = "/vendor/openpgp/openpgp.min.mjs";

/** Makes a key through the screen and answers with its passphrase. The private key stays in this browser context. */
async function makeKey(page: Page, name: string): Promise<string> {
  await page.goto("/encryption");
  await page.getByRole("button", { name: "Make a key" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email address (optional)").fill(`${name.toLowerCase().replace(/\s+/g, ".")}@example.org`);
  await page.getByRole("button", { name: "Suggest one" }).click();
  const passphrase = await page.getByLabel("Passphrase", { exact: true }).inputValue();
  expect(passphrase).toMatch(/^([a-z]{5}-){4}[a-z]{5}$/);
  await page.getByRole("button", { name: "Make key", exact: true }).click();
  await expect(page.getByRole("heading", { name: `${name}’s key is ready` })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Done" }).click();
  return passphrase;
}

test.describe("encryption", () => {
  test("fetches the OpenPGP library only on the Encryption screen, as a file of its own", async ({ page }) => {
    const errors = watchForErrors(page);
    const requested: string[] = [];
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await page.goto("/notes");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(requested).not.toContain(VENDOR);

    await page.getByRole("complementary", { name: "Main" }).getByRole("link", { name: "Encryption" }).click();
    await expect(page.getByRole("heading", { name: "Encryption", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No keys yet" })).toBeVisible();
    expect(requested).toContain(VENDOR);

    // It is the file its authors publish, served with its licence beside it.
    const library = await page.request.get(VENDOR);
    expect(library.headers()["content-type"]).toContain("javascript");
    expect(await library.text()).toMatch(/^\/\*! OpenPGP\.js v6\.3\.2 /);
    expect(await (await page.request.get("/vendor/openpgp/LGPL-3.0.txt")).text()).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
    expect(await (await page.request.get("/vendor/openpgp/NOTICE.txt")).text()).toContain("You may replace the file");
    expect(errors).toEqual([]);
  });

  test("makes a key, adds someone else’s, then encrypts, signs, decrypts and verifies text", async ({ page }) => {
    const errors = watchForErrors(page);
    const passphrase = await makeKey(page, "Ada Example");

    // The key is listed with its fingerprint in full, and the server holds only the public half.
    const mine = page.locator("li[data-key]").filter({ hasText: "Ada Example" });
    await expect(mine.getByText("Decrypts and signs here")).toBeVisible();
    await expect(mine.getByText("Private key: on this device only")).toBeVisible();
    const fingerprint = await mine.getAttribute("data-key");
    expect(fingerprint).toMatch(/^[0-9a-f]{40}$/);
    await expect(mine.getByRole("img", { name: /^Fingerprint / })).toHaveAttribute(
      "aria-label",
      `Fingerprint ${fingerprint!.toUpperCase().match(/.{4}/g)!.join(" ")}`,
    );
    const stored = await api(page, "GET", "/api/encryption/keys");
    expect(stored.keys.find((key: { fingerprint: string }) => key.fingerprint === fingerprint)).toMatchObject({
      hasPrivateKey: false,
      mine: true,
    });
    expect(JSON.stringify(stored)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(stored)).not.toContain(passphrase);

    // Someone else's public key, pasted in. It can only encrypt, and nobody has checked it yet.
    await page.getByRole("button", { name: "Add a key" }).first().click();
    await page.getByLabel("The key, as text").fill(fixture("gnupg-public.asc"));
    await page.getByRole("button", { name: "Add key", exact: true }).click();
    const theirs = page.locator(`li[data-key="${GNUPG_FINGERPRINT}"]`);
    await expect(theirs.getByText("Encrypts and checks signatures only")).toBeVisible();
    await expect(theirs.getByRole("checkbox")).not.toBeChecked();

    // A private key is refused where a public key is expected, by the page and by the server.
    const refused = await page.request.fetch("/api/encryption/keys", {
      method: "PUT",
      headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
      data: JSON.stringify({ publicKey: fixture("gnupg-private-protected.asc") }),
    });
    expect(refused.status()).toBe(400);

    // Encrypt to both and sign.
    await page.getByRole("tab", { name: "Text" }).click();
    await page.getByLabel("Text to encrypt").fill("Meet at the bothy at dusk.");
    await page.getByRole("checkbox", { name: /Ada Example/ }).check();
    await page.getByRole("checkbox", { name: /Gpg Person/ }).check();
    await page.getByRole("combobox", { name: "Sign as" }).click();
    await page.getByRole("option", { name: /Ada Example/ }).click();
    await page.getByLabel("Passphrase for Ada Example’s key").fill("not the passphrase");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("That is not this key’s passphrase.")).toBeVisible();
    await page.getByLabel("Passphrase for Ada Example’s key").fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("Ada Example’s key is unlocked.")).toBeVisible();
    await page.getByRole("button", { name: "Encrypt", exact: true }).click();
    const armored = await page.getByLabel("Encrypted message").inputValue();
    expect(armored).toMatch(/^-----BEGIN PGP MESSAGE-----/);
    expect(armored).not.toContain("bothy");

    // Decrypt it: the key is still unlocked, and the signature is reported as its own key's.
    await page.getByRole("radio", { name: "Decrypt" }).click();
    await page.getByLabel("Encrypted message").fill(armored);
    await expect(page.getByText("Ada Example (your key, unlocked)")).toBeVisible();
    await expect(page.getByText("Gpg Person (their key: only they can open it with it)")).toBeVisible();
    await page.getByRole("button", { name: "Decrypt", exact: true }).click();
    await expect(page.getByLabel("Decrypted text")).toHaveValue("Meet at the bothy at dusk.");
    await expect(page.getByText("Good signature")).toBeVisible();
    await expect(page.getByText("That is your own key (Ada Example).")).toBeVisible();

    // A message that was changed shows nothing.
    const lines = armored.split("\n");
    const middle = Math.floor(lines.length / 2);
    lines[middle] = `${lines[middle]!.slice(0, 10)}${lines[middle]![10] === "A" ? "B" : "A"}${lines[middle]!.slice(11)}`;
    await page.getByLabel("Encrypted message").fill(lines.filter((line) => !/^=[A-Za-z0-9+/]{4}$/.test(line)).join("\n"));
    await page.getByRole("button", { name: "Decrypt", exact: true }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByLabel("Decrypted text")).toHaveCount(0);

    // Sign on its own, then check it; then check what gpg clear-signed.
    await page.getByRole("radio", { name: "Sign", exact: true }).click();
    await page.getByLabel("Text to sign").fill("I will be on the air at 19:00.");
    await page.getByRole("button", { name: "Sign", exact: true }).click();
    const signed = await page.getByLabel("Signed text").inputValue();
    expect(signed).toContain("-----BEGIN PGP SIGNED MESSAGE-----");
    await page.getByRole("radio", { name: "Check a signature" }).click();
    await page.getByLabel("Signed text").fill(signed.replace("19:00", "21:00"));
    await page.getByRole("button", { name: "Check signature" }).click();
    await expect(page.getByText("Bad signature")).toBeVisible();
    await page.getByLabel("Signed text").fill(fixture("gnupg-clearsigned.asc"));
    await page.getByRole("button", { name: "Check signature" }).click();
    await expect(page.getByText("Good signature")).toBeVisible();
    // A good signature by a key nobody here has checked is said to be exactly that, not proof of who wrote it.
    await expect(page.getByText(/nobody at this device has checked that/)).toBeVisible();

    // After the fingerprint is marked as checked, the same signature says so.
    await page.getByRole("tab", { name: "Keys" }).click();
    await page.locator(`li[data-key="${GNUPG_FINGERPRINT}"]`).getByRole("checkbox").check();
    await page.getByRole("tab", { name: "Text" }).click();
    await page.getByRole("radio", { name: "Check a signature" }).click();
    await page.getByLabel("Signed text").fill(fixture("gnupg-clearsigned.asc"));
    await page.getByRole("button", { name: "Check signature" }).click();
    await expect(page.getByText(/You marked that key as checked with its owner, Gpg Person/)).toBeVisible();
    // The mark lives in the browser: the server was told nothing.
    expect(JSON.stringify(await api(page, "GET", "/api/encryption/keys"))).not.toContain("checked");

    // Leaving the screen forgets the unlocked key.
    await page.getByRole("complementary", { name: "Main" }).getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await page.goBack();
    await page.getByRole("radio", { name: "Sign", exact: true }).click();
    await expect(page.getByLabel("Passphrase for Ada Example’s key")).toBeVisible();

    await api(page, "DELETE", `/api/encryption/keys/${fingerprint}`);
    await api(page, "DELETE", `/api/encryption/keys/${GNUPG_FINGERPRINT}`);
    expect(errors).toEqual([]);
  });

  test("encrypts text with a passphrase alone, and reads what gpg -c wrote", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/encryption?tab=text");
    await page.getByLabel("Text to encrypt").fill("Symmetric, like gpg -c.");
    await page.getByRole("checkbox", { name: "Let a passphrase open it" }).check();
    await page.getByLabel("Passphrase", { exact: true }).fill("four words are enough");
    await page.getByLabel("Passphrase, again").fill("four words are enuff");
    await expect(page.getByText("The two do not match.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Encrypt", exact: true })).toBeDisabled();
    await page.getByLabel("Passphrase, again").fill("four words are enough");
    await page.getByRole("button", { name: "Encrypt", exact: true }).click();
    const armored = await page.getByLabel("Encrypted message").inputValue();

    await page.getByRole("radio", { name: "Decrypt" }).click();
    await page.getByLabel("Encrypted message").fill(armored);
    await page.getByLabel("The message’s passphrase").fill("the wrong words");
    await page.getByRole("button", { name: "Decrypt", exact: true }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await page.getByLabel("The message’s passphrase").fill("four words are enough");
    await page.getByRole("button", { name: "Decrypt", exact: true }).click();
    await expect(page.getByLabel("Decrypted text")).toHaveValue("Symmetric, like gpg -c.");
    await expect(page.getByText("Not signed")).toBeVisible();

    await page.getByLabel("Encrypted message").fill(fixture("gnupg-symmetric.asc"));
    await page.getByLabel("The message’s passphrase").fill("symmetric fixture");
    await page.getByRole("button", { name: "Decrypt", exact: true }).click();
    await expect(page.getByLabel("Decrypted text")).toHaveValue("Written by gpg -c.\n");
    expect(errors).toEqual([]);
  });

  test("encrypts a file to a download and decrypts it back to the same bytes", async ({ page }, testInfo) => {
    const errors = watchForErrors(page);
    const original = Buffer.from(Uint8Array.from({ length: 300_000 }, (_, index) => (index * 31 + (index >> 8)) % 256));
    await page.goto("/encryption?tab=files");
    // Nothing of a file goes to the server: no request from this screen may carry a body of any size.
    const uploads: number[] = [];
    page.on("request", (request) => {
      const size = request.postDataBuffer()?.length ?? 0;
      if (size > 2000) uploads.push(size);
    });

    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "route notes.bin", mimeType: "application/octet-stream", buffer: original });
    await expect(page.getByText("route notes.bin")).toBeVisible();
    await page.getByRole("checkbox", { name: "Let a passphrase open it" }).check();
    await page.getByLabel("Passphrase", { exact: true }).fill("a passphrase for the file");
    await page.getByLabel("Passphrase, again").fill("a passphrase for the file");
    await page.getByRole("button", { name: "Encrypt file" }).click();
    const [saved] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Save route notes.bin.gpg" }).click(),
    ]);
    expect(saved.suggestedFilename()).toBe("route notes.bin.gpg");
    const encryptedPath = testInfo.outputPath("route notes.bin.gpg");
    await saved.saveAs(encryptedPath);
    const encrypted = fs.readFileSync(encryptedPath);
    expect(encrypted.length).toBeGreaterThan(original.length);
    expect(encrypted.includes(original.subarray(0, 64))).toBe(false);

    await page.getByRole("radio", { name: "Decrypt" }).click();
    await page.locator('input[type="file"]').setInputFiles(encryptedPath);
    await page.getByLabel("The file’s passphrase").fill("not the passphrase");
    await page.getByRole("button", { name: "Decrypt file" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /did not decrypt|does not open/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Save / })).toHaveCount(0);
    await page.getByLabel("The file’s passphrase").fill("a passphrase for the file");
    await page.getByRole("button", { name: "Decrypt file" }).click();
    const [opened] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save route notes.bin" }).click()]);
    const decryptedPath = testInfo.outputPath("decrypted.bin");
    await opened.saveAs(decryptedPath);
    expect(fs.readFileSync(decryptedPath).equals(original)).toBe(true);

    // A file that gpg -c wrote.
    await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "gnupg-symmetric-binary.gpg"));
    await page.getByLabel("The file’s passphrase").fill("symmetric fixture");
    await page.getByRole("button", { name: "Decrypt file" }).click();
    const [fromGpg] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /^Save / }).click()]);
    const fromGpgPath = testInfo.outputPath("from-gpg.bin");
    await fromGpg.saveAs(fromGpgPath);
    expect(fs.readFileSync(fromGpgPath).equals(Buffer.from(Uint8Array.from({ length: 4096 }, (_, index) => (index * 7) % 256)))).toBe(true);

    expect(uploads).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("encrypts a page of notes, opens it with its passphrase, edits it and takes the encryption off again", async ({ page }) => {
    const errors = watchForErrors(page);
    const created = await api(page, "POST", "/api/notes", {
      title: "Bothy combination",
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Padlock" }] },
          { type: "paragraph", content: [{ type: "text", text: "Seven four one nine, kept under the windowsill." }] },
        ],
      },
    });
    const id = created.note.id as string;
    const searchHits = async (q: string) => (await api(page, "GET", `/api/search?kinds=note&q=${q}`)).results.length as number;
    expect(await searchHits("windowsill")).toBe(1);

    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") sent.push(request.postData() ?? "");
    });

    await page.goto(`/notes/${id}`);
    await expect(page.getByText("Seven four one nine")).toBeVisible();
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Encrypt this page…" }).click();
    const dialog = page.getByRole("dialog", { name: "Encrypt “Bothy combination”?" });
    // It says what stays readable and what still holds the old text before anything happens.
    await expect(dialog.getByText(/the title, icon, tags and cover/)).toBeVisible();
    await expect(dialog.getByText(/Backups, portable drives/)).toBeVisible();
    // A short passphrase is not enough for something anyone on the network can copy.
    await dialog.getByLabel("Passphrase for this page", { exact: true }).fill("too short");
    await dialog.getByLabel("Passphrase for this page, again").fill("too short");
    await expect(dialog.getByRole("button", { name: "Encrypt this page" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Suggest one" }).click();
    const passphrase = await dialog.getByLabel("Passphrase for this page", { exact: true }).inputValue();
    await dialog.getByRole("button", { name: "Encrypt this page" }).click();

    await expect(page.getByRole("heading", { name: "This page is encrypted" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Page title")).toHaveValue("Bothy combination");
    const stored = (await api(page, "GET", `/api/notes/${id}`)).note;
    expect(stored.encrypted).toBe(true);
    expect(JSON.stringify(stored.content)).toContain("-----BEGIN PGP MESSAGE-----");
    expect(JSON.stringify(stored.content)).not.toContain("windowsill");
    expect(await searchHits("windowsill")).toBe(0);
    expect(await searchHits("bothy")).toBe(1);
    expect(await (await page.request.get(`/api/notes/${id}/export.md`)).text()).not.toContain("windowsill");

    // The wrong passphrase opens nothing; the right one shows the page.
    await page.getByLabel("Passphrase for this page").fill("not the passphrase at all");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByText("Seven four one nine")).toHaveCount(0);
    await page.getByLabel("Passphrase for this page").fill(passphrase);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("Seven four one nine, kept under the windowsill.")).toBeVisible();

    // Edit: what is saved is a new message, never the text.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Page content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" Ask the warden about paraffin.");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 15_000 });
    const edited = (await api(page, "GET", `/api/notes/${id}`)).note;
    expect(edited.encrypted).toBe(true);
    expect(JSON.stringify(edited.content)).not.toMatch(/paraffin|windowsill/);
    expect(edited.content).not.toEqual(stored.content);
    expect(await searchHits("paraffin")).toBe(0);

    // Lock, reload, unlock: the edit is there.
    await page.getByRole("button", { name: "Lock" }).click();
    await expect(page.getByRole("heading", { name: "This page is encrypted" })).toBeVisible();
    await page.reload();
    await page.getByLabel("Passphrase for this page").fill(passphrase);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("Ask the warden about paraffin.")).toBeVisible();

    // Neither the passphrase nor a word of the page was in anything this browser sent.
    for (const body of sent) {
      expect(body).not.toContain(passphrase);
      expect(body).not.toMatch(/paraffin|windowsill|Seven four one nine/);
    }

    // Taking the encryption off puts the text back, and search finds it again.
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Remove encryption…" }).click();
    await page.getByRole("button", { name: "Remove encryption", exact: true }).click();
    await expect(page.getByText(/is no longer encrypted/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Page content" })).toContainText("Ask the warden about paraffin.");
    const plain = (await api(page, "GET", `/api/notes/${id}`)).note;
    expect(plain.encrypted).toBe(false);
    expect(await searchHits("paraffin")).toBe(1);
    await api(page, "DELETE", `/api/notes/${id}`);
    expect(errors).toEqual([]);
  });

  test("locks a page with one of my keys, and opens and edits it with that key", async ({ page }) => {
    const errors = watchForErrors(page);
    const passphrase = await makeKey(page, "Page Owner");
    const fingerprint = await page.locator("li[data-key]").filter({ hasText: "Page Owner" }).getAttribute("data-key");
    const note = (
      await api(page, "POST", "/api/notes", {
        title: "Locked with a key",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The spare key is behind the meter." }] }] },
      })
    ).note;

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Encrypt this page…" }).click();
    const dialog = page.getByRole("dialog", { name: "Encrypt “Locked with a key”?" });
    await dialog.getByRole("radio", { name: "One of my keys" }).click();
    // The key has to be unlocked first, so that the encrypted page can be decrypted back and checked before it is saved.
    await expect(dialog.getByRole("button", { name: "Encrypt this page" })).toBeDisabled();
    await dialog.getByLabel("Passphrase for Page Owner’s key").fill(passphrase);
    await dialog.getByRole("button", { name: "Unlock", exact: true }).click();
    await dialog.getByRole("button", { name: "Encrypt this page" }).click();
    await expect(page.getByRole("heading", { name: "This page is encrypted" })).toBeVisible({ timeout: 15_000 });
    const stored = (await api(page, "GET", `/api/notes/${note.id}`)).note;
    expect(stored.encrypted).toBe(true);
    expect(JSON.stringify(stored.content)).not.toContain("meter");

    // Closing the dialog forgot the key: the page asks for its passphrase again.
    await page.getByLabel("Passphrase for Page Owner’s key").fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("The spare key is behind the meter.")).toBeVisible();

    // Two edits in a row, each saved as a new message checked with the same unlocked key.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Page content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" Ask next door.");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Page content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" They are in after six.");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible({ timeout: 15_000 });
    const edited = (await api(page, "GET", `/api/notes/${note.id}`)).note;
    expect(JSON.stringify(edited.content)).not.toMatch(/meter|next door|after six/);

    // In a browser without the private key, the page says where the key is and opens nothing.
    const other = await page.context().browser()!.newContext();
    const elsewhere = await other.newPage();
    await elsewhere.goto(`${new URL(page.url()).origin}/notes/${note.id}`);
    await expect(elsewhere.getByText(/It is locked with Page Owner’s key, whose\s+private half is not on this device/)).toBeVisible();
    await expect(elsewhere.getByLabel(/Passphrase/)).toHaveCount(0);
    await other.close();

    // Back here, after a reload, the key opens both edits.
    await page.reload();
    await page.getByLabel("Passphrase for Page Owner’s key").fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByText("The spare key is behind the meter. Ask next door. They are in after six.")).toBeVisible();

    await api(page, "DELETE", `/api/notes/${note.id}`);
    await api(page, "DELETE", `/api/encryption/keys/${fingerprint}`);
    expect(errors).toEqual([]);
  });

  test("will not encrypt a page that has a picture on it", async ({ page }) => {
    const errors = watchForErrors(page);
    const note = (await api(page, "POST", "/api/notes", { title: "With a picture" })).note;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const uploaded = await page.request.post(`/api/attachments?noteId=${note.id}`, {
      headers: { "X-Outpost-Request": "1" },
      multipart: { file: { name: "dot.png", mimeType: "image/png", buffer: png } },
    });
    const attachment = (await uploaded.json()).attachment;
    await api(page, "PATCH", `/api/notes/${note.id}`, {
      content: { type: "doc", content: [{ type: "image", attrs: { src: attachment.url, alt: null, title: null } }] },
    });
    await page.goto(`/notes/${note.id}`);
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Encrypt this page…" }).click();
    await expect(page.getByText("This page has pictures or attached files")).toBeVisible();
    await expect(page.getByRole("button", { name: "Encrypt this page" })).toHaveCount(0);
    expect((await api(page, "GET", `/api/notes/${note.id}`)).note.encrypted).toBe(false);
    await api(page, "DELETE", `/api/notes/${note.id}`);
    expect(errors).toEqual([]);
  });

  test("works a cipher by hand, and prints one-time pads with nothing else on the paper", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/encryption?tab=hand");
    // The line about amateur radio, with its source.
    await expect(page.getByText(/OFW611, condition 6, clause 19\(b\)/)).toBeVisible();

    // Caesar, with the published example.
    await page.getByLabel("Message", { exact: true }).fill("THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG");
    await page.getByLabel("Shift").fill("23");
    await expect(page.getByTestId("cipher-output")).toHaveValue("QEB NRFZH YOLTK CLU GRJMP LSBO QEB IXWV ALD");
    await expect(page.getByTestId("cipher-strength")).toContainText("No protection");

    // Playfair, with the published example and its square.
    await page.getByRole("combobox", { name: "Cipher" }).click();
    await page.getByRole("option", { name: "Playfair" }).click();
    await page.getByLabel("Message", { exact: true }).fill("hide the gold in the tree stump");
    await page.getByLabel("Key", { exact: true }).fill("playfair example");
    await expect(page.getByTestId("cipher-output")).toHaveValue("BMODZ BXDNA BEKUD MUIXM MOUVI F");
    await expect(page.getByRole("table", { name: "Key square" }).getByRole("row").first()).toHaveText("PLAYF");

    // The one-time pad: a pad that is too short is refused, in words.
    await page.getByRole("combobox", { name: "Cipher" }).click();
    await page.getByRole("option", { name: "One-time pad" }).click();
    await page.getByLabel("Message", { exact: true }).fill("hello");
    await page.getByLabel("Pad letters").fill("XMC");
    await expect(page.getByRole("alert").filter({ hasText: "A pad is never repeated" })).toBeVisible();
    await page.getByLabel("Pad letters").fill("XMCKL");
    await expect(page.getByTestId("cipher-output")).toHaveValue("EQNVZ");
    await expect(page.getByTestId("cipher-strength")).toContainText("never used again");

    // Pads to print: two copies of each, from the browser's random source. From here on the page sends nothing.
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") sent.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.getByRole("button", { name: "Make pads" }).click();
    const preview = page.getByTestId("pad-preview");
    await expect(preview.locator("[data-pad]")).toHaveCount(4);
    const serials = await preview.locator("[data-pad]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-pad")));
    expect(new Set(serials).size).toBe(2);
    const copies = await preview
      .locator(`[data-pad="${serials[0]}"]`)
      .evaluateAll((nodes) =>
        nodes.map((node) => [...node.querySelectorAll("p.flex span:last-child")].map((line) => line.textContent).join("")),
      );
    expect(copies[0]).toBe(copies[1]);
    expect(copies[0]!.replace(/\s/g, "")).toMatch(/^[A-Z]{250}$/);

    // "Print pads" opens the sheets over the whole screen. Nothing is printed until Print is pressed.
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
        // What a browser that prints does first.
        window.dispatchEvent(new Event("beforeprint"));
      };
    });
    const printed = () => page.evaluate(() => (window as unknown as { printed: number }).printed);
    await page.getByRole("button", { name: "Print pads" }).click();
    const view = page.getByRole("dialog", { name: "One-time pads" });
    await expect(view).toBeVisible();
    expect(await printed()).toBe(0);
    const sheet = page.locator("body > .print-sheet");
    await expect(sheet.getByText(`One-time pad ${serials[0]}, copy 1 of 2`)).toBeVisible();
    await expect(view.getByText("A saved PDF is another copy of the pads")).toBeVisible();
    await expect(view.getByRole("link", { name: "Save as PDF" })).toHaveAttribute("download", "one-time-pads.pdf");
    await view.getByRole("button", { name: "Print", exact: true }).click();
    expect(await printed()).toBe(1);

    // On paper the sheet is all there is: not the bar above it, not the notes, not the app behind.
    await page.emulateMedia({ media: "print" });
    await expect(sheet.getByText(`One-time pad ${serials[0]}, copy 1 of 2`)).toBeVisible();
    await expect(sheet.getByText(/Never use any part of this pad for a second message/).first()).toBeVisible();
    await expect(sheet.locator(".print-chrome").first()).toBeHidden();
    await expect(sheet.getByText("A saved PDF is another copy of the pads")).toBeHidden();
    await expect(sheet.getByText("Save as PDF")).toBeHidden();
    await expect(page.locator("#root")).toBeHidden();
    // Back to the page's own media, not to "screen" by force: the print further down has to be laid out for paper.
    await page.emulateMedia({ media: null });
    await expect(page.locator("#root")).toBeVisible();
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toBeHidden();

    // The browser's own print of a long set runs on from page to page: the view that fills the screen does not
    // cut it off at the foot of the first. Chromium lays the print out as a PDF only when it has no window.
    await page.getByRole("combobox", { name: "Pads" }).click();
    await page.getByRole("option", { name: "8" }).click();
    await page.getByRole("combobox", { name: "Letters in each" }).click();
    await page.getByRole("option", { name: "500" }).click();
    await page.getByRole("button", { name: "Make new pads" }).click();
    await expect(preview.locator("[data-pad]")).toHaveCount(16);
    await page.getByRole("button", { name: "Print pads" }).click();
    await expect(view).toBeVisible();
    if (test.info().project.use.headless !== false) {
      const paper = (await page.pdf({ format: "A4" })).toString("latin1");
      // Sixteen copies of ten lines, three to a page of A4. Cut off at the first page, it would be one.
      expect((paper.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(6);
    }
    await page.keyboard.press("Escape");
    await expect(view).toBeHidden();

    expect(sent).toEqual([]);
    expect(errors).toEqual([]);
  });
});
