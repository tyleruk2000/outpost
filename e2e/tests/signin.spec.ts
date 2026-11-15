import { SIGNIN_URL } from "../playwright.config";
import { expect, test } from "./fixtures";

test.use({ baseURL: SIGNIN_URL });

test.describe("sign-in", () => {
  test.describe.configure({ mode: "serial" });

  test("asks for an administrator on first run, then for a sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Create the administrator account" })).toBeVisible();
    // Nothing behind the sign-in screen is readable.
    expect((await page.request.get("/api/settings")).status()).toBe(401);
    expect((await page.request.get("/api/storage/locations")).status()).toBe(401);

    await page.getByLabel("Username").fill("keeper");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Create the administrator account" })).toBeVisible();
    await page.getByLabel("Password").fill("lantern on the north shelf");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();

    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "outpost_session");
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");

    await page.getByRole("button", { name: /Sign out keeper/ }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("rejects a wrong password and accepts the right one", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("keeper");
    await page.getByLabel("Password").fill("not the password at all");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That username or password is not correct.")).toBeVisible();
    await page.getByLabel("Password").fill("lantern on the north shelf");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  });
});
