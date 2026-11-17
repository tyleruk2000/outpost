/**
 * Shared by the two walks to every screen (every-screen.spec.ts on a wide screen,
 * every-screen.mobile.spec.ts on a phone). The screens walked are read from the
 * navigation as drawn, so a screen added to apps/web/src/components/nav.ts is walked
 * without changing these tests; the list below is only the floor, so that a navigation
 * that lost its entries cannot pass by having nothing to walk.
 */
import { expect, type Page, type TestInfo } from "@playwright/test";

export const AT_LEAST: Array<[string, string]> = [
  ["Home", "/"],
  ["Search", "/search"],
  ["How search works", "/search/how-it-works"],
  ["Explore", "/explore"],
  ["Library", "/library"],
  ["Maps", "/maps"],
  ["Chat", "/chat"],
  ["Contacts", "/contacts"],
  ["Encryption", "/encryption"],
  ["Radio", "/radio"],
  ["HF propagation", "/radio/propagation"],
  ["HF coverage", "/radio/coverage"],
  ["Communication plans", "/radio/plans"],
  ["Contact log", "/radio/log"],
  ["Repeaters", "/radio/repeaters"],
  ["Frequencies to listen to", "/radio/frequencies"],
  ["Notes", "/notes"],
  ["Import files", "/import"],
  ["Downloads", "/downloads"],
  ["Storage", "/storage"],
  ["Manage and clean up", "/storage/manage"],
  ["Bring back from a drive", "/storage/merge"],
  ["Kept on this device", "/kept"],
  ["Settings", "/settings"],
  ["Set-up guide", "/help/search-and-answers"],
];

/** The made-up name the "not secure" projects reach the test server by (playwright.config.ts). */
export const NOT_SECURE_HOST = "outpost-lan.test";

/**
 * Pressed from the screen before: checks the address, that the screen has a top-level
 * heading of its own (not the page for an unknown address), and that the page is
 * secure or not as the project says.
 */
export async function expectArrived(page: Page, path: string, testInfo: TestInfo, before?: string): Promise<string> {
  await expect(page).toHaveURL(new RegExp(`^[^?#]*//[^/]+${path === "/" ? "/" : `${path.replace(/[/.]/g, "\\$&")}`}([?#].*)?$`));
  // The address changes at once; the screen may follow a moment later, once its code has loaded. Wait for the
  // heading to be another than the screen pressed from: every screen has one of its own.
  const heading = () =>
    page
      .getByRole("heading", { level: 1 })
      .first()
      .textContent({ timeout: 2_000 })
      .then(
        (text) => text?.trim() ?? "",
        () => "",
      );
  await expect.poll(heading, { message: `${path} shows a heading of its own` }).not.toBe("");
  if (before !== undefined) await expect.poll(heading, { message: `${path} shows a heading other than "${before}"` }).not.toBe(before);
  const name = await heading();
  expect(name).not.toBe("There is nothing at this address");
  if (testInfo.project.name.startsWith("not-secure")) {
    expect(await page.evaluate(() => window.isSecureContext), "reached at an address browsers do not treat as secure").toBe(false);
  }
  return name;
}

/**
 * The errors that fail a walk. At an address that is not secure Chrome writes one message to the console on
 * every page: it ignores the server's Cross-Origin-Opener-Policy header there. The page is unaffected, and
 * leaving the header off such requests would need the server to know it is not behind an HTTPS proxy, so the
 * message is let through here and only here; anything else, and every uncaught error, still fails.
 */
export function failing(errors: string[]): string[] {
  return errors.filter(
    (error) => !/^The Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy/.test(error),
  );
}
