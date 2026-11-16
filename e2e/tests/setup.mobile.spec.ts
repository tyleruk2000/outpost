/**
 * Setting up answers and chat on a phone, in three presses, against the stand-in for a
 * local model server (apps/server/test/model-server.ts), and the set-up guide that both
 * sections and the Chat screen link to. The stand-in speaks the chat protocol; it is not
 * a language model. No model is downloaded and the internet stays cut off.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

const MODEL_URL = process.env.OUTPOST_E2E_MODEL_URL!;
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("setting up answers and chat, on a phone", () => {
  test.describe.configure({ mode: "serial" });
  let addressBefore = "";

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    addressBefore = (await api(page, "GET", "/api/settings")).settings["answers.endpoint"];
    // Nothing set up. The stand-in is not where Ollama listens, so its address is in Settings, as it
    // would be for anyone whose model server is not at the usual place; that is asked first.
    await api(page, "PATCH", "/api/settings", { "answers.enabled": false, "answers.model": "", "answers.endpoint": `${MODEL_URL}/v1` });
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    // Leave the server as other suites expect it: no model server set up.
    const page = await browser.newPage();
    await api(page, "PATCH", "/api/settings", { "answers.enabled": false, "answers.model": "", "answers.endpoint": addressBefore });
    await page.close();
  });

  test("the guide is a page inside Outpost, linked from both sections and from Chat, and reads on a phone", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "Chat needs a language model on your own computer" })).toBeVisible();
    await page.getByRole("link", { name: "Set-up guide" }).click();
    await expect(page).toHaveURL(/\/help\/search-and-answers#answers-and-chat$/);
    await expect(page.getByRole("heading", { level: 1, name: "Setting up search by meaning, answers and chat" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Answers and chat, with Ollama" })).toBeInViewport();

    // The steps for one kind of computer at a time; the exact command, shown whole and copyable.
    const getOllama = page.getByRole("region", { name: "Step 1: get Ollama" });
    await expect(getOllama.getByText("This step needs the internet")).toBeVisible();
    await getOllama.getByRole("radio", { name: "Raspberry Pi" }).click();
    await expect(getOllama.getByText("curl -fsSL https://ollama.com/install.sh | sh")).toBeVisible();
    const getModel = page.getByRole("region", { name: "Step 2: get a model" });
    await expect(getModel.getByText("ollama pull llama3.2:3b")).toBeVisible();
    await expect(getModel.getByRole("list", { name: "Recommended small models" }).getByRole("listitem")).toHaveCount(5);
    // The link to Ollama's own page opens in the browser; nothing on this page reaches the internet by itself.
    await getOllama.getByRole("radio", { name: "Mac" }).click();
    const download = getOllama.getByRole("link", { name: /ollama\.com\/download/ });
    await expect(download).toHaveAttribute("href", "https://ollama.com/download");
    await expect(download).toHaveAttribute("target", "_blank");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    // It is reached from where it is needed, and from the navigation too, under Settings.
    await page.getByRole("button", { name: "More" }).click();
    await expect(
      page.getByRole("dialog", { name: "More" }).getByRole("list", { name: "Under Settings" }).getByRole("link", { name: "Set-up guide" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // From the guide to the switch, and from each section back to its part of the guide.
    await page.goto("/help/search-and-answers#search-by-meaning");
    await page.getByRole("link", { name: "Open Search by meaning in Settings" }).click();
    await expect(page).toHaveURL(/\/settings#semantic-title$/);
    const meaning = page.getByRole("region", { name: "Search by meaning" });
    await expect(meaning.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#search-by-meaning");
    const answers = page.getByRole("region", { name: "Answers from your library" });
    await expect(answers.getByRole("link", { name: "I do not have Ollama yet" })).toHaveAttribute(
      "href",
      "/help/search-and-answers#answers-and-chat",
    );
    expect(errors).toEqual([]);
  });

  test("answers are set up in three presses: find the model server, use the model offered, try it", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/settings#answers-title");
    const section = page.getByRole("region", { name: "Answers from your library" });
    // Before: one thing to press. No switch, no address, no numbers.
    await expect(section.getByRole("button")).toHaveCount(1);
    await expect(section.getByRole("switch")).toHaveCount(0);
    await expect(section.getByRole("textbox")).toHaveCount(0);
    expect((await api(page, "GET", "/api/answers/status")).ready).toBe(false);

    // Press one.
    await section.getByRole("button", { name: "Look for Ollama on this computer" }).click();
    await expect(section.getByText("Found a model server on this computer.")).toBeVisible();
    // A model is already chosen: the smallest of the server's that can write. The one that cannot is last, and says so.
    await expect(section.getByRole("radio", { name: /^stand-in:latest/ })).toBeChecked();
    await expect(section.getByRole("radio").last()).toContainText("embed-only:latest");
    await expect(section.getByRole("radio").last()).toContainText("This one is for searching, not writing");
    expect((await api(page, "GET", "/api/answers/status")).ready).toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Press two.
    const use = section.getByRole("button", { name: "Use this model" });
    expect((await use.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
    await use.click();

    // Press three: the model is asked, it answers, and answers are on with nothing more to do.
    await section.getByRole("button", { name: "Try it", exact: true }).click();
    await expect(section.getByTestId("answers-state")).toContainText("Ready: answers are written by stand-in:latest on this computer.");
    await expect(section.getByTestId("answers-state")).toContainText(/Just now it answered “ready” in/);
    await expect(section.getByRole("switch", { name: "Write answers" })).toBeChecked();
    expect(await api(page, "GET", "/api/answers/status")).toMatchObject({ enabled: true, ready: true, model: "stand-in:latest" });
    expect((await api(page, "GET", "/api/settings")).settings).toMatchObject({
      "answers.enabled": true,
      "answers.endpoint": `${MODEL_URL}/v1`,
      "answers.model": "stand-in:latest",
    });
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // And Chat, which was waiting on the same thing, is ready too.
    await section.getByRole("link", { name: "Chat" }).click();
    await expect(page.getByRole("textbox", { name: "Your message" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the model server stopping is said in the first line, with the one next step", async ({ page }) => {
    // The same set-up, but nothing is listening at the address any more.
    await api(page, "PATCH", "/api/settings", { "answers.endpoint": "http://127.0.0.1:9/v1" });
    await page.goto("/settings#answers-title");
    const section = page.getByRole("region", { name: "Answers from your library" });
    await expect(section.getByTestId("answers-state")).toContainText("On, but not working yet");
    await expect(section.getByText("The model server is not answering")).toBeVisible();
    await expect(section.getByRole("button", { name: "Look again" })).toBeVisible();
    await expect(section.getByRole("link", { name: "What else to check" })).toHaveAttribute(
      "href",
      "/help/search-and-answers#when-it-does-not-work",
    );
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
