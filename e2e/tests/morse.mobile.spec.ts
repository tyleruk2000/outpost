/**
 * The Morse trainer on a phone: reached from the More sheet under Radio, a Receive drill
 * chosen from a drop-down, played and answered, its result kept and shown on Progress;
 * on Send, a character keyed on the on-screen paddles and decoded; and On the air's one
 * link out going to the Reverse Beacon Network's own page, with nothing fetched from it.
 * The browser's audio runs as it would, unheard.
 */
import { api, expect, test, watchForErrors } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Morse trainer on a phone", () => {
  test("plays a drill, keeps the result for Progress, and decodes keying on the paddles", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/");
    await api(page, "DELETE", "/api/morse");

    // Reached from the More sheet, under Radio.
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" }).tap();
    // The screens under Radio are folded away until asked for.
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Show the screens under Radio" }).tap();
    await page.getByRole("dialog", { name: "More" }).locator('a[href="/radio/morse"]').first().tap();
    await expect(page.getByRole("heading", { level: 1, name: "Morse trainer" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Receive L1, Koch lesson 1" })).toHaveAttribute("aria-selected", "true");
    expect(await overflow()).toBeLessThanOrEqual(0);

    // A drill picked from the drop-down, kept short.
    await page.getByRole("combobox", { name: "Drill" }).tap();
    await page.getByRole("option", { name: "Common words" }).tap();
    await expect(page.getByRole("combobox", { name: "Drill" })).toHaveText("Common words");
    const groups = page.getByRole("group", { name: "Groups" });
    for (let i = 0; i < 20; i++) {
      const lower = groups.getByRole("button", { name: "Decrease groups" });
      if (await lower.isDisabled()) break;
      await lower.tap();
    }

    // Played, copied while it plays, and graded on Enter.
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    await expect(page.getByText("Listen…")).toBeVisible();
    const copy = page.getByLabel("What did you hear?");
    await copy.fill("THE");
    await copy.press("Enter");
    await expect(page.getByText(/copied/).first()).toBeVisible();
    await expect.poll(async () => (await api(page, "GET", "/api/morse")).sessionCount).toBeGreaterThanOrEqual(1);
    const kept = await api(page, "GET", "/api/morse");
    expect(kept.sessions[0]).toMatchObject({ kind: "receive" });

    // Progress shows it, and says whose it is.
    await page.getByRole("tab", { name: "Progress" }).tap();
    await expect(page).toHaveURL(/tab=progress/);
    await expect(page.getByText(/\d+ practice sessions? kept\./)).toBeVisible();
    await expect(page.getByText(/shared by everyone who uses this copy of Outpost/)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Send: a dit on the left paddle and a dah on the right are decoded as E and T.
    await page.getByRole("tab", { name: "Send" }).tap();
    await page.getByRole("radio", { name: "Iambic paddle" }).tap();
    const paddles = page.getByTestId("morse-paddles");
    await expect(paddles).toBeVisible();
    await paddles.scrollIntoViewIfNeeded();
    const box = (await paddles.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(150);
    // Real touches, through the browser's own touch input: each finger is a touch of its own.
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    const fingers = (points: Array<{ id: number; x: number }>, type: "touchStart" | "touchEnd" | "touchMove") =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(({ id, x }) => ({ id, x: box.x + x, y })) });
    const tap = async (x: number) => {
      await fingers([{ id: 1, x }], "touchStart");
      await page.waitForTimeout(40);
      await fingers([], "touchEnd");
    };
    const tape = page.getByRole("log", { name: "Decoded Morse" });
    await tap(box.width * 0.25);
    await expect(tape).toContainText("E", { timeout: 5000 });
    await page.waitForTimeout(800);
    await tap(box.width * 0.75);
    await expect(tape).toContainText(/E\s*T/, { timeout: 5000 });
    await page.getByRole("button", { name: "Clear decoded text" }).tap();
    // Both thumbs at once: an iambic squeeze, dit first, let go during the dit's gap. Curtis mode B adds the dah: A.
    await fingers([{ id: 1, x: box.width * 0.25 }], "touchStart");
    await page.waitForTimeout(20);
    await fingers(
      [
        { id: 1, x: box.width * 0.25 },
        { id: 2, x: box.width * 0.75 },
      ],
      "touchStart",
    );
    await page.waitForTimeout(90);
    await fingers([], "touchEnd");
    await expect(tape).toContainText("A", { timeout: 5000 });
    expect(await overflow()).toBeLessThanOrEqual(0);

    // On the air: the one link out, to the network's own page, opened only by a press.
    await page.getByRole("tab", { name: "On the air" }).tap();
    const rbn = page.getByRole("link", { name: /reversebeacon\.net|Reverse Beacon Network/ }).first();
    await expect(rbn).toHaveAttribute("href", "https://www.reversebeacon.net/main.php");
    await expect(page.getByText(/Outpost itself asks the network nothing/)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    await api(page, "DELETE", "/api/morse");
    expect(errors).toEqual([]);
  });
});
