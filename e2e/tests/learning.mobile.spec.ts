import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { COURSE_BOOK, COURSE_UUID } from "../../apps/server/test/course-archive.ts";
import { expect, test, watchForErrors } from "./fixtures";

/**
 * Learning progress, at phone width, with the stand-in course archive served by the
 * tests' own stand-in for kiwix-serve (apps/server/test/course-archive.ts). It is a
 * made-up course: no real Khan Academy archive is opened.
 */
const headers = { "X-Outpost-Request": "1" };
/** The frame's sandbox as it was before learning progress: this work must not change it. */
const SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";

async function addCourse(request: APIRequestContext): Promise<string> {
  const { locations } = await (await request.get("/api/storage/locations")).json();
  const location = locations.find((candidate: { isDefault: boolean }) => candidate.isDefault);
  const relPath = `collections/zim/${COURSE_BOOK}.zim`;
  // Bytes that pass for the start of a ZIM archive: magic number, version, UUID. The stand-in serves the rest.
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(COURSE_UUID.replace(/-/g, ""), "hex").copy(header, 8);
  fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), header);
  const imported = await request.post("/api/kiwix/import", { headers, data: { locationId: location.id, relPath } });
  expect(imported.ok(), await imported.text()).toBe(true);
  const id = (await imported.json()).collection.id as string;
  await expect
    .poll(async () => (await (await request.get(`/api/kiwix/books/${id}`)).json()).book, { timeout: 20_000 })
    .toMatchObject({ title: "Number school", ready: true });
  return id;
}

/** Chooses a learner in the reader's bar by typing a name, as someone new on the device does. */
async function chooseSomeoneElse(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Choose who is learning|Switch learner/ }).click();
  await page.getByRole("menuitem", { name: "Someone else…" }).click();
  const dialog = page.getByRole("dialog", { name: "Who is learning?" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Use this name" }).click();
  await expect(page.getByRole("button", { name: `Learning: ${name}. Switch learner` })).toBeVisible();
}

test.describe("learning progress in a course", () => {
  test.describe.configure({ mode: "serial" });
  let id: string;
  test.beforeAll(async ({ request }) => {
    id = await addCourse(request);
  });
  test.afterAll(async ({ request }) => {
    await request.delete("/api/learning/progress?everyone=1", { headers });
    const { collections } = await (await request.get("/api/collections")).json();
    for (const collection of collections.filter((candidate: { title: string }) => candidate.title === "Number school")) {
      await request.delete(`/api/collections/${collection.id}?deleteFiles=true`, { headers });
    }
  });

  test("one learner does two lessons and carries on where they left off; a second sees none of it as theirs", async ({ page, baseURL }) => {
    const errors = watchForErrors(page);
    await page.goto(`/library/read/${id}/`);
    const frame = page.frameLocator("iframe");
    await expect(frame.getByRole("heading", { name: "Number school" })).toBeVisible();
    // The sandbox is exactly as it was, and so is the policy the proxy sends with each page.
    await expect(page.locator("iframe")).toHaveAttribute("sandbox", SANDBOX);
    const proxied = await page.request.get(`/kiwix/open/content/${COURSE_BOOK}/index`);
    expect(proxied.headers()["content-security-policy"]).toBe(
      `default-src 'self' ${new URL(baseURL!).origin} data: blob: 'unsafe-inline' 'unsafe-eval'; sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads`,
    );
    // The bar fits the phone: nothing scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await chooseSomeoneElse(page, "Sam");
    await frame.getByRole("link", { name: "Fractions" }).click();
    await expect(page).toHaveURL(new RegExp(`/library/read/${id}/topics/fractions$`));
    await frame.getByRole("link", { name: "Halves" }).click();
    await expect(page).toHaveURL(/lessons\/halves$/);

    // Lesson one: marked done by hand.
    await page.getByRole("button", { name: "Mark “Halves” as done" }).click();
    await expect(page.getByRole("button", { name: "Done: Halves. Press to undo" })).toHaveAttribute("aria-pressed", "true");

    // Lesson two: a video, counted as watched when it has played to the end.
    await frame.getByRole("link", { name: "Next: Quarters" }).click();
    await expect(page).toHaveURL(/lessons\/quarters$/);
    await frame.getByRole("link", { name: "Next: Adding fractions" }).click();
    await expect(page).toHaveURL(/videos\/adding-fractions$/);
    await expect(page.getByRole("button", { name: "Mark “Adding fractions” as done" })).toBeEnabled();
    await frame.locator("video").evaluate((video: HTMLVideoElement) => {
      video.muted = true;
      return video.play();
    });
    await expect(page.getByRole("button", { name: "Done: Adding fractions. Press to undo" })).toBeVisible({ timeout: 10_000 });

    // Leaving the reader writes where Sam got to.
    await page.getByRole("link", { name: "Back to your collections" }).click();
    await page.goto(`/library/collections/${id}`);
    const carryOn = page.getByRole("link", { name: /Carry on where Sam left off: Adding fractions/ });
    await expect(carryOn).toBeVisible();
    await carryOn.click();
    await expect(page).toHaveURL(new RegExp(`/library/read/${id}/videos/adding-fractions$`));
    await expect(frame.getByRole("heading", { name: "Adding fractions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done: Adding fractions. Press to undo" })).toBeVisible();

    // The Library's Learning tab: where Sam got to, two pages done, two of the three in Fractions.
    await page.goto("/library?tab=learning");
    const sams = page.getByRole("list", { name: "Courses Sam has opened" });
    await expect(sams.getByRole("heading", { name: "Number school" })).toBeVisible();
    await expect(sams.getByText("Got to “Adding fractions”", { exact: false })).toBeVisible();
    await expect(sams.getByText("2 done")).toBeVisible();
    await expect(sams.getByText("2 of 3 done in Fractions")).toBeVisible();

    // The tablet changes hands. The new learner's page is not done, and none of Sam's progress is theirs.
    await page.goto(`/library/read/${id}/lessons/halves`);
    await expect(frame.getByRole("heading", { name: "Halves" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done: Halves. Press to undo" })).toBeVisible();
    await chooseSomeoneElse(page, "Alex");
    await expect(page.getByRole("button", { name: "Mark “Halves” as done" })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("link", { name: "Back to your collections" }).click();
    await page.goto(`/library/collections/${id}`);
    await expect(page.getByRole("link", { name: /Carry on where Alex left off: Halves/ })).toBeVisible();
    await expect(page.getByText(/Sam left off/)).toHaveCount(0);
    await page.goto("/library?tab=learning");
    const alexs = page.getByRole("list", { name: "Courses Alex has opened" });
    await expect(alexs.getByText("0 done")).toBeVisible();
    await expect(alexs.getByText(/done in Fractions/)).toHaveCount(0);
    await expect(page.getByText("Got to “Adding fractions”", { exact: false })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
