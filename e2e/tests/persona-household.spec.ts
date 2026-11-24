/**
 * The persona fixes for a household outside the UK and an older reader (24 Nov 2026), at a
 * desktop by keyboard and on a tablet at 200% text: marking home by typed coordinates,
 * the country taken from the outlines (Rosenheim is in Germany), an emergency number never
 * guessed (Canada's is 911; an unknown country's is asked for), weather that asks a German
 * home's own service and never the UK's, the sun from home, and a sidebar that names its
 * screens at large text.
 */
import { api, expect, test, watchForErrors } from "./fixtures";
import { homeAt, putBack, shot } from "./persona-household";

test.afterEach(async ({ page }) => {
  await putBack(page);
});

test.describe("at a desktop, by keyboard", () => {
  test("marks home by typing its position, and says at once which country it took", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const { households } = await api<{ households: Array<{ id: string }> }>(page, "GET", "/api/households");
    await page.goto(`/prepare/households/${households[0]!.id}`);
    const mark = page.getByRole("button", { name: /^Mark (a new )?home on the map$/ });
    await mark.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: /^Where .* is$/ });
    const find = dialog.getByRole("searchbox", { name: "Find the place" });
    await expect(find).toBeVisible();
    await find.focus();
    await page.keyboard.type("47.8561, 12.1225");
    await expect(dialog.getByRole("button", { name: /^Use 47\.8561, 12\.1225/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(dialog.getByTestId("here-chosen")).toHaveText("Chosen: 47.8561, 12.1225");
    await dialog.getByRole("textbox", { name: /^Name for this place/ }).fill("E2E Rosenheim");
    await shot(page, "desktop-mark-home-typed");
    await dialog.getByRole("button", { name: "Make it home" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Outpost takes it to be in Germany/)).toBeVisible();
    await expect(page.getByText(/Worked out from home: Germany\./)).toBeVisible();
    await shot(page, "desktop-household-germany");
    expect(errors).toEqual([]);
  });

  test("gives a Canadian home 911 and asks a home elsewhere for its number, never 112", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await homeAt(page, "E2E Boston", 42.3601, -71.0589);
    const boston = await api<{ plan: { emergencyNumber: string } }>(page, "POST", "/api/emergency-plans", {
      name: "E2E Boston plan",
      kind: "other",
      kindText: "",
      templateId: null,
      reviewEveryDays: null,
      body: {
        steps: [],
        people: [],
        contacts: [],
        places: [],
        comms: { text: "", commPlanId: null, frequency: "", schedule: "" },
        days: null,
        supplies: [],
        powerPlanId: null,
        where: [],
        notes: "",
        links: [],
      },
    });
    // Boston is in the United States (Canada's box reaches it; its outline does not).
    expect(boston.plan.emergencyNumber).toBe("911");
    await putBack(page);
    await homeAt(page, "E2E São Paulo", -23.5505, -46.6333);
    await page.goto("/prepare/plans");
    await page.getByRole("button", { name: "New plan" }).first().click();
    const choose = page.getByRole("dialog", { name: "New emergency plan" });
    await choose.getByRole("radio", { name: /^Power cut/ }).check();
    await choose.getByLabel("Name").fill("E2E Power cut");
    await choose.getByRole("button", { name: "Make the plan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "E2E Power cut" })).toBeVisible();
    await expect(page.getByText("Not known for Brazil: add your local number.")).toBeVisible();
    await expect(page.getByText(/Emergency services: 112/)).toHaveCount(0);
    await shot(page, "desktop-plan-brazil-number");
    await page
      .getByRole("link", { name: /^Use now/ })
      .first()
      .click();
    await expect(page.getByText("Not given in this plan.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add your local number" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("weather for a home in Germany asks MeteoAlarm and Open-Meteo, never the Met Office or the Environment Agency", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await homeAt(page, "E2E Rosenheim", 47.8561, 12.1225);
    await page.goto("/prepare/weather");
    // The household's home is offered in one press.
    await page.getByRole("button", { name: "Use E2E Rosenheim" }).click();
    const asks = page.getByTestId("update-asks");
    await expect(asks).toContainText("Open-Meteo");
    await expect(asks).toContainText("MeteoAlarm");
    await expect(asks).not.toContainText(/Environment Agency|Met Office/);
    await expect(page.getByRole("tab", { name: "Flood" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Warnings" }).click();
    await expect(page.getByText(/ask EUMETNET – MeteoAlarm for Germany|ask MeteoAlarm for Germany/)).toBeVisible();
    await shot(page, "desktop-weather-germany");
    expect(errors).toEqual([]);
  });
});

test.describe("on a tablet at 200% text", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const apply = () => document.documentElement.style.setProperty("font-size", "32px", "important");
      if (document.documentElement) apply();
      document.addEventListener("DOMContentLoaded", apply);
    });
  });

  test("the sidebar names each screen, and the whole of it scrolls to Preparedness", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    const rail = page.getByRole("complementary", { name: "Main" });
    const knowledge = rail.getByRole("navigation", { name: "Knowledge" });
    // Words, not icons alone.
    await expect(knowledge.getByText("Contacts", { exact: true })).toBeAttached();
    await expect(knowledge.getByText("Home", { exact: true })).toBeVisible();
    await shot(page, "ipad-200-rail-top");
    const preparedness = knowledge.getByText("Preparedness", { exact: true });
    await preparedness.scrollIntoViewIfNeeded();
    await expect(preparedness).toBeInViewport();
    // Each name inside the rail, not cut at its edge.
    const railBox = (await rail.boundingBox())!;
    const nameBox = (await preparedness.boundingBox())!;
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(railBox.x + railBox.width + 1);
    await shot(page, "ipad-200-rail-scrolled");
    // A screen with others under it opens a short menu of them, itself first.
    await preparedness.tap();
    await shot(page, "ipad-200-rail-menu");
    await page.getByRole("menuitem", { name: "Preparedness", exact: true }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Preparedness" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the sun starts from home, says so, and the solar clock gives today's and tomorrow's sunrise", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await homeAt(page, "E2E London", 51.5074, -0.1278);
    await page.goto("/tools/outdoors#sun");
    const sun = page.locator("#sun");
    await expect(sun.locator("input[name=place]")).toHaveValue("51.5074, -0.1278");
    await expect(sun.getByText(/^Sunrise at E2E London today/)).toBeVisible();
    await sun.getByRole("radio", { name: "Tomorrow" }).tap();
    await expect(sun.getByText(/^Sunrise at E2E London tomorrow/)).toBeVisible();
    await shot(page, "ipad-200-outdoors-sun");
    await page.goto("/tools/solar-clock");
    await expect(page.getByText(/^Sunrise \d\d:\d\d, sunset \d\d:\d\d$/).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, "ipad-200-solar-clock");
    expect(errors).toEqual([]);
  });
});
