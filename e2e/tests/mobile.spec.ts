import { lampRoomBook } from "./epub";
import { api, clearPages, expect, test, watchForErrors } from "./fixtures";

test.describe("on a phone", () => {
  test("uses the bottom bar and the More sheet instead of the sidebar", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Main" })).toBeHidden();

    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("heading", { name: "Storage", level: 1 })).toBeVisible();

    // Nothing spills sideways at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Quick search" }).click();
    await expect(page.getByRole("dialog", { name: "Search and go to" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("keeps a diagram and a figure legible in a chapter, scrolling inside their own boxes", async ({ page }) => {
    const errors = watchForErrors(page);
    const added = await api(page, "POST", "/api/catalog/entries/logbook73.guide.td-h3/add", {});
    const contents = await api(page, "GET", `/api/collections/${added.collectionId}/chapters`);
    const chapter = contents.sections
      .flatMap((section: { chapters: Array<{ key: string; documentId: string }> }) => section.chapters)
      .find((item: { key: string }) => item.key === "getting-started");
    await page.goto(`/library/documents/${chapter.documentId}`);
    await expect(page.getByRole("navigation", { name: "Book" })).toBeVisible();

    // A diagram is drawn when it comes near the screen; until then its place is held.
    await page.locator(".doc-figure-pending[role=img], .doc-figure:has(img)").first().scrollIntoViewIfNeeded();
    const diagram = page.locator(".doc-figure img").first();
    await expect(diagram).toBeVisible({ timeout: 20_000 });
    const figure = page.locator(".doc-figure svg[role=img]").first();
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toBeVisible();

    // Neither is squeezed to fit: lettering made for 14 and 12 pixels stays above 10.
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".doc-figure-drawing")].map((drawing) => {
        const image = drawing.querySelector("img");
        const svg = drawing.querySelector("svg");
        const natural = image ? image.naturalWidth : (svg?.viewBox.baseVal.width ?? 0);
        const box = drawing.parentElement!;
        return {
          scale: drawing.getBoundingClientRect().width / natural,
          scrolls: box.scrollWidth > box.clientWidth,
          fits: box.clientWidth <= window.innerWidth,
        };
      }),
    );
    expect(shown.length).toBeGreaterThanOrEqual(2);
    for (const item of shown) {
      expect(item.scale).toBeGreaterThanOrEqual(0.8);
      expect(item.fits).toBe(true);
    }
    expect(shown.some((item) => item.scrolls)).toBe(true);
    // And the page itself never scrolls sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("reaches every screen from the bottom bar: four tabs, and everything else in the More sheet", async ({ page }) => {
    // Some seventy screens, each opened from the sheet: past 45 s in a full run, where the server holds every test's data.
    test.setTimeout(90_000);
    const errors = watchForErrors(page);
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Main" });
    await expect(bar.getByRole("link")).toHaveText(["Home", "Library", "Maps", "Notes"]);

    // Grouped as the sidebar is: the screens for finding and reading, then those that look after the library.
    // A screen with others under it is a heading; the screens under it are folded away until asked for.
    const groups: Array<[string, string, Array<[string, string]>]> = [
      [
        "Search",
        "/search",
        [
          ["How search works", "/search/how-it-works"],
          ["How search by meaning works", "/search/how-meaning-works"],
          ["How search was tuned", "/search/how-it-was-tuned"],
        ],
      ],
      // A tab, listed again as the heading of the screen under it.
      ["Library", "/library", [["Import from Calibre", "/library/calibre"]]],
      // A tab, listed again as the heading of the screen under it.
      ["Maps", "/maps", [["Offline maps", "/maps/data"]]],
      // A tab, listed again as the heading of the screen under it.
      ["Notes", "/notes", [["Import", "/import"]]],
      ["Explore", "/explore", []],
      ["Chat", "/chat", []],
      ["Contacts", "/contacts", []],
      ["Messages", "/messages", []],
      ["Encryption", "/encryption", []],
      [
        "Radio",
        "/radio",
        [
          ["HF propagation", "/radio/propagation"],
          ["HF coverage", "/radio/coverage"],
          ["Communication plans", "/radio/plans"],
          ["Contact log", "/radio/log"],
          ["Repeaters", "/radio/repeaters"],
          ["Morse trainer", "/radio/morse"],
          ["Frequencies to listen to", "/radio/frequencies"],
          ["Satellites", "/radio/satellites"],
          ["Licences and band plans", "/radio/licences"],
          ["Heard on the radio", "/radio/heard"],
        ],
      ],
      [
        "Tools",
        "/tools",
        [
          ["Water", "/tools/water"],
          ["Outdoors", "/tools/outdoors"],
          ["Radio calculators", "/tools/radio"],
          ["Building", "/tools/building"],
          ["Cooking", "/tools/cooking"],
          ["Rations", "/tools/rations"],
          ["Power and batteries", "/tools/power"],
          ["QR codes", "/tools/qr"],
          ["Devices on this network", "/tools/network"],
          ["Solar clock", "/tools/solar-clock"],
          ["Compass", "/tools/compass"],
          ["Night sky", "/tools/night-sky"],
          ["Celestial navigation", "/tools/celestial-navigation"],
          ["Tide times", "/tools/tides"],
          ["Garden", "/tools/garden"],
        ],
      ],
      [
        "Preparedness",
        "/prepare",
        [
          ["Households", "/prepare/households"],
          ["Emergency plans", "/prepare/plans"],
          ["Supplies", "/prepare/supplies"],
          ["Weather and hazards", "/prepare/weather"],
          ["Nuclear preparedness", "/prepare/nuclear"],
          ["Medical sheets", "/prepare/medical"],
          ["Keeping in touch", "/prepare/keeping-in-touch"],
          ["Grab cards", "/prepare/grab-cards"],
          ["Household book", "/prepare/book"],
          ["Check-in and roll call", "/prepare/check-in"],
          ["Log of events", "/prepare/log"],
          ["Routine checks", "/prepare/checks"],
          ["Offline drill", "/prepare/offline-drill"],
        ],
      ],
      [
        "Games",
        "/games",
        [
          // Quick games first, the slow ones the household builds over weeks last.
          ["Chess", "/games/chess"],
          ["Snake", "/games/snake"],
          ["Pairs", "/games/pairs"],
          ["Sudoku", "/games/sudoku"],
          ["Solitaire", "/games/solitaire"],
          ["Draughts", "/games/draughts"],
          ["Peg solitaire", "/games/peg-solitaire"],
          ["Skerry", "/games/skerry"],
          ["Allotment", "/games/allotment"],
          ["Steading", "/games/steading"],
        ],
      ],
      ["Downloads and tasks", "/downloads", []],
      [
        "Storage",
        "/storage",
        [
          ["Manage and clean up", "/storage/manage"],
          ["Bring back changes from a drive", "/storage/merge"],
        ],
      ],
      ["On this phone", "/kept", []],
      [
        "Settings",
        "/settings",
        [
          ["Server status", "/settings/status"],
          ["Search and chat set-up", "/help/search-and-answers"],
          ["Raspberry Pi set-up", "/help/deployment#h-on-a-raspberry-pi-step-by-step"],
        ],
      ],
      ["Help", "/help", []],
    ];
    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("navigation").getByRole("link")).toHaveText(groups.map(([name]) => name));
    // Settings and Storage are in sight without scrolling, and the sheet fits the screen.
    const box = await sheet.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    for (const name of ["Storage", "Settings"]) {
      const link = (await sheet.getByRole("link", { name, exact: true }).boundingBox())!;
      expect(link.y + link.height, `${name} is in sight`).toBeLessThanOrEqual(box!.y + box!.height);
    }
    // Each group opens to show the screens under it, in order.
    for (const [name, , children] of groups) {
      if (children.length === 0) continue;
      await sheet.getByRole("button", { name: `Show the screens under ${name}` }).click();
      await expect(sheet.getByRole("list", { name: `Under ${name}` }).getByRole("link")).toHaveText(children.map(([child]) => child));
    }
    await page.keyboard.press("Escape");

    for (const [name, path, children] of groups) {
      for (const [entry, to, parent] of [[name, path, null] as const, ...children.map(([child, at]) => [child, at, name] as const)]) {
        await bar.getByRole("button", { name: "More" }).click();
        const link = page.getByRole("dialog", { name: "More" }).getByRole("link", { name: entry, exact: true });
        // The group of the screen in view is open already; any other is opened by its button.
        if (parent && !(await link.isVisible())) {
          await page
            .getByRole("dialog", { name: "More" })
            .getByRole("button", { name: `Show the screens under ${parent}` })
            .click();
        }
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${to.replace(/[/.]/g, "\\$&")}(\\?.*)?$`));
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expect(page.getByRole("dialog", { name: "More" })).toBeHidden();
      }
    }

    // This tab runs the build the server is serving, so there is nothing to reload for.
    const health = await api(page, "GET", "/api/health");
    expect(health.web).toMatch(/^index-.+\.js$/);
    await expect(page.getByText("Outpost has been updated.")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("fits the manage screen and its list of everything installed at phone width", async ({ page }) => {
    const errors = watchForErrors(page);
    for (const view of ["", "?view=installed", "?view=leftovers", "?view=clean-up"]) {
      await page.goto(`/storage/manage${view}`);
      await expect(page.getByRole("heading", { name: "Manage and clean up", level: 1 })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Clean up" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `sideways overflow on ${view || "the space view"}`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });

  test("reads an EPUB book at phone width: nothing spills sideways, and what is pressed is large enough to press", async ({ page }) => {
    const errors = watchForErrors(page);
    const upload = await page.request.post("/api/documents", {
      headers: { "X-Outpost-Request": "1" },
      multipart: { file: { name: "lamp-room-phone.epub", mimeType: "application/epub+zip", buffer: lampRoomBook() } },
    });
    // The other project may have added the same book to this server already; either way it is there.
    const id = (await upload.json()).results[0].document.id;
    const sideways = () =>
      page.evaluate(() => {
        const region = document.querySelector<HTMLElement>("section[tabindex]");
        return Math.max(
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
          region ? region.scrollWidth - region.clientWidth : 0,
        );
      });

    await page.goto(`/library/documents/${id}`);
    await expect(page.getByRole("heading", { level: 2, name: "The Lamp Room" })).toBeVisible();
    expect(await sideways()).toBeLessThanOrEqual(1);
    const start = page.getByRole("link", { name: /Start reading|Continue reading/ });
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const line of await page.getByRole("region", { name: "Contents" }).getByRole("link").all()) {
      expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("region", { name: "Contents" }).getByRole("link", { name: "The lamp" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The lamp" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Book" })).toContainText("2 of 3");
    expect(await sideways()).toBeLessThanOrEqual(1);
    // The text keeps a line a person can read: no wider than the screen, and not squeezed into a column.
    const line = await page.locator("article p").first().boundingBox();
    expect(line!.width).toBeGreaterThan(300);
    expect(line!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const next = page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /Next/ });
    await next.scrollIntoViewIfNeeded();
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await next.click();
    await expect(page.getByRole("heading", { level: 1, name: "Fog" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("records a track with the card folded out of the map's way, and saves it", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 54.46, longitude: -3.09, accuracy: 6 });
    await page.goto("/maps?lat=54.46&lon=-3.09&z=15");
    await page.locator('.outpost-map[data-map-idle="true"]').waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Dismiss" }).click();

    await page.getByRole("button", { name: "Record a track", exact: true }).click();
    // What a browser will not do is said before the start, and fits the screen.
    const intro = page.getByRole("region", { name: "Record a track" });
    await expect(intro).toContainText("A recording runs only while this screen is on and Outpost is in front.");
    const start = intro.getByRole("button", { name: "Start recording" });
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await start.click();

    const card = page.getByRole("region", { name: "Recording", exact: true });
    // The first position has arrived before the phone is moved.
    await expect(card).toContainText("Position good to 6 m.");
    await context.setGeolocation({ latitude: 54.4602, longitude: -3.09, accuracy: 6 });
    await expect(card).toContainText("22 m (");
    // Folded to one line, it still shows how far, and still has Pause and Stop at a size a thumb can hit.
    await card.getByRole("button", { name: "Show less" }).click();
    await expect(card).toContainText("Recording 22 m,");
    for (const name of ["Pause", "Stop", "Show the figures"]) {
      const box = (await card.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(40);
      expect(box.width, name).toBeGreaterThanOrEqual(40);
    }
    // The map's own tools are not under the folded card.
    await expect(page.getByRole("button", { name: "Measure a distance" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await card.getByRole("button", { name: "Stop", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Save the recording" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("From the phone");
    await dialog.getByRole("button", { name: "Save to routes" }).click();
    await expect(page.getByText("“From the phone” is saved to your routes.")).toBeVisible();
    const { tracks } = await api(page, "GET", "/api/maps/tracks");
    const saved = tracks.filter((track: { name: string }) => track.name === "From the phone");
    expect(saved).toHaveLength(1);
    await api(page, "DELETE", `/api/maps/tracks/${saved[0].id}`);
  });

  test("gives controls a comfortable touch size", async ({ page }) => {
    await page.goto("/storage");
    const button = page.getByRole("button", { name: "Add location" });
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("moves a page with a long press and a drag, and with Move to… without dragging", async ({ page }) => {
    const errors = watchForErrors(page);
    await clearPages(page);
    const kit = (await api(page, "POST", "/api/notes", { title: "Kit" })).note;
    const ropes = (await api(page, "POST", "/api/notes", { title: "Ropes" })).note;
    const parentOf = async (id: string) =>
      (await api(page, "GET", "/api/notes/tree")).notes.find((note: { id: string }) => note.id === id).parentId as string | null;

    await page.goto("/notes");
    const tree = page.getByRole("main").getByRole("tree", { name: "Pages" });
    const row = (name: string) => tree.getByRole("treeitem", { name, exact: true });
    // The lists above the tree arrive after it and push it down; measure only once it has stopped moving.
    await page.waitForLoadState("networkidle");
    await row("Ropes").scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const first = await row("Ropes").boundingBox();
        await page.waitForTimeout(150);
        const second = await row("Ropes").boundingBox();
        return first !== null && second !== null && first.y === second.y;
      })
      .toBe(true);
    const from = (await row("Ropes").boundingBox())!;
    const onto = (await row("Kit").boundingBox())!;

    // Touches through the browser's own input, as a finger makes them.
    const session = await page.context().newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      session.send("Input.dispatchTouchEvent", {
        type: type as "touchStart",
        touchPoints: x === undefined || y === undefined ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
      });
    const start = { x: from.x + 120, y: from.y + from.height / 2 };
    const end = { x: onto.x + 120, y: onto.y + onto.height / 2 };
    const scrolledBefore = await page.evaluate(() => window.scrollY);

    await touch("touchStart", start.x, start.y);
    const lifted = page.locator("[data-page-lifted]");
    await expect(lifted).toBeVisible();
    for (let step = 1; step <= 10; step += 1) {
      await touch("touchMove", start.x + ((end.x - start.x) * step) / 10, start.y + ((end.y - start.y) * step) / 10);
      await page.waitForTimeout(20);
    }
    // The chip says in words where the page will land, and the list has not scrolled under the finger.
    await expect(lifted).toContainText("Inside “Kit”");
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolledBefore);
    await touch("touchEnd");

    await expect.poll(() => parentOf(ropes.id)).toBe(kit.id);
    await expect(lifted).toBeHidden();
    await expect(page).toHaveURL(/\/notes$/);
    await page.getByRole("button", { name: "Undo" }).tap();
    await expect.poll(() => parentOf(ropes.id)).toBe(null);

    // The same move with no dragging at all.
    const actions = row("Ropes").getByRole("button", { name: "Actions for Ropes" });
    expect((await actions.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await actions.tap();
    await page.getByRole("menuitem", { name: "Move to…" }).tap();
    const picker = page.getByRole("dialog", { name: "Move “Ropes”" });
    await expect(picker).toBeVisible();
    const choice = picker.getByRole("option", { name: "Kit", exact: true });
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await choice.tap();
    await expect.poll(() => parentOf(ropes.id)).toBe(kit.id);
    expect(errors).toEqual([]);
  });
});
