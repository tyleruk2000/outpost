/**
 * Chat, end to end in the packaged app, against a stand-in for a local model server
 * (apps/server/test/model-server.ts). The stand-in speaks the chat protocol; it is not a
 * language model. In a plain conversation it repeats what it was told; given passages,
 * it repeats the first sentence of each. No model is downloaded and the internet stays
 * cut off.
 */
import type { Page } from "@playwright/test";
import { api, expect, test, watchForErrors } from "./fixtures";

const MODEL_URL = process.env.OUTPOST_E2E_MODEL_URL!;
const stats = async (page: Page) =>
  (await (await page.request.get(`${MODEL_URL}/stats`)).json()) as { chats: number; abandoned: number; writing: number };
const box = (page: Page) => page.getByRole("textbox", { name: "Your message" });
const replies = (page: Page) => page.getByRole("article", { name: /^Reply from/ });

/** Pages of notes this suite made, to be taken away again when it is done. */
const made: string[] = [];

test.describe("chat with a local model", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ browser }) => {
    // Leave the server as other suites expect it: no model server set up, and no pages of ours in the tree.
    const page = await browser.newPage();
    for (const id of made) await page.request.delete(`/api/notes/${id}`, { headers: { "X-Outpost-Request": "1" } });
    await page.request.fetch("/api/settings", {
      method: "PATCH",
      headers: { "X-Outpost-Request": "1", "Content-Type": "application/json" },
      data: JSON.stringify({ "answers.enabled": false, "answers.model": "" }),
    });
    await page.close();
  });

  test("before a model server is set up: says what a local model is, and looks for Ollama only when asked", async ({ page }) => {
    const errors = watchForErrors(page);
    await api(page, "PATCH", "/api/settings", { "answers.enabled": false, "answers.model": "" });
    const before = await stats(page);
    await page.goto("/");
    await page.getByRole("navigation", { name: "Knowledge" }).getByRole("link", { name: "Chat" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Chat" })).toBeVisible();
    // Said once, plainly: there are no accounts.
    await expect(page.getByText(/there are no accounts, so anyone who can open it can read them/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chat needs a language model on your own computer" })).toBeVisible();
    await expect(page.getByText(/Outpost does not include one/)).toBeVisible();
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open the setting" })).toHaveAttribute("href", "/settings#answers-title");

    // Nothing has been asked of any model server by opening the screen.
    expect((await stats(page)).chats).toBe(before.chats);
    // Looking is one press. The suite's server is told that Ollama listens where nothing does, and the address
    // in Settings is put there too, so a real Ollama on the machine under test is never asked and never found.
    await api(page, "PATCH", "/api/settings", { "answers.endpoint": "http://127.0.0.1:9/v1" });
    await page.getByRole("button", { name: "Look for Ollama on this computer" }).click();
    await expect(page.getByText("Ollama was not found", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Set-up guide" })).toHaveAttribute("href", "/help/search-and-answers#answers-and-chat");
    // Finding one changes no setting: chat is still not set up until the person says to use it.
    expect((await api(page, "GET", "/api/chat/status")).usable).toBe(false);
    expect(errors).toEqual([]);
  });

  test("starts a conversation, watches the reply being written, and stops it", async ({ page }) => {
    const errors = watchForErrors(page);
    const lamp = await api(page, "POST", "/api/notes", {
      title: "Lamp oil for chat",
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Wicks" }] },
          { type: "paragraph", content: [{ type: "text", text: "Trim a lamp wick square before lighting it. A ragged wick smokes." }] },
        ],
      },
    });
    made.push(lamp.note.id);
    await api(page, "PATCH", "/api/settings", {
      "answers.enabled": true,
      "answers.endpoint": `${MODEL_URL}/v1`,
      "answers.model": "stand-in-long:latest",
    });
    const before = await stats(page);

    await page.goto("/chat");
    // The model picker is fed by the server's own list, with sizes because the stand-in answers as Ollama does.
    await page.getByRole("button", { name: /^Model: stand-in-long:latest/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Models on this computer")).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: /stand-in-markdown:latest/ })).toContainText("3.2B parameters, Q4_K_M");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("chat-mode")).toContainText("A plain conversation");
    await box(page).fill("Tell me about lamp wicks");
    await box(page).press("Shift+Enter");
    await box(page).pressSequentially("in two lines");
    await expect(box(page)).toHaveValue("Tell me about lamp wicks\nin two lines");
    await box(page).press("Enter");

    // The conversation now exists, is named after the message, and the reply arrives a piece at a time.
    await expect(page).toHaveURL(/\/chat\/[0-9a-z]+$/);
    await expect(page.getByRole("textbox", { name: "Name of this conversation" })).toHaveValue("Tell me about lamp wicks");
    const reply = replies(page).last();
    await expect(reply).toHaveAttribute("aria-busy", "true");
    await expect(reply.getByTestId("reply-text")).toContainText("Paragraph 2");
    expect((await stats(page)).writing).toBe(1);
    const written = async () => ((await reply.getByTestId("reply-text").textContent()) ?? "").length;
    const partial = await written();
    await expect.poll(written).toBeGreaterThan(partial);

    // Stop is where Send was, and it stops the model server's work, not just the page.
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(reply.getByText("Stopped. This reply is unfinished.")).toBeVisible();
    await expect.poll(async () => (await stats(page)).abandoned).toBe(before.abandoned + 1);
    await expect.poll(async () => (await stats(page)).writing).toBe(0);
    await expect(reply.getByTestId("reply-text")).not.toContainText("Paragraph 24");
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("regenerates the last reply, edits and resends the last message, and keeps the conversation on the server", async ({ page }) => {
    const errors = watchForErrors(page);
    await api(page, "PATCH", "/api/settings", { "answers.model": "stand-in:latest" });
    await page.goto("/chat");
    await page
      .getByRole("list", { name: "Conversations" })
      .getByRole("link", { name: /Tell me about lamp wicks/ })
      .click();
    // What was stopped is still here after a reload: it was kept by the server, not the tab.
    await expect(replies(page).last().getByText("Stopped. This reply is unfinished.")).toBeVisible();

    // The conversation chose no model of its own, so it follows the setting.
    await replies(page).last().getByRole("button", { name: "Try again" }).click();
    await expect(replies(page).last().getByTestId("reply-text")).toContainText("That is message 1 from you that I was sent.");
    await expect(replies(page)).toHaveCount(1);

    await box(page).fill("A secnod mesage");
    await box(page).press("Enter");
    await expect(replies(page).last().getByTestId("reply-text")).toContainText("You said “A secnod mesage”. That is message 2");
    await expect(box(page)).toHaveValue("");

    await page.getByRole("article", { name: "You said" }).last().getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("Writing your last message again. Sending replaces it and its reply.")).toBeVisible();
    await expect(box(page)).toHaveValue("A secnod mesage");
    await box(page).fill("A second message");
    await page.getByRole("button", { name: "Send again" }).click();
    await expect(replies(page).last().getByTestId("reply-text")).toContainText("You said “A second message”. That is message 2");
    await expect(page.getByText("A secnod mesage")).toHaveCount(0);
    await expect(replies(page)).toHaveCount(2);

    // Regenerate writes the last reply again; the rest stays.
    await replies(page).last().getByRole("button", { name: "Regenerate" }).click();
    await expect(replies(page).last().getByRole("button", { name: "Regenerate" })).toBeVisible();
    await expect(replies(page)).toHaveCount(2);

    // Rename it where its name stands; the list shows the new name.
    const name = page.getByRole("textbox", { name: "Name of this conversation" });
    await name.fill("Lamp wicks");
    await name.press("Enter");
    // Saved, and focus stays in the field rather than dropping to the top of the app.
    await expect(name).toBeFocused();
    await page.getByRole("link", { name: "Chat", exact: true }).first().click();
    await expect(page.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /^Lamp wicks/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("draws a reply's Markdown safely, copies a code block, and saves the reply as a new page", async ({ page, context }) => {
    const errors = watchForErrors(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/chat");
    await page.getByRole("button", { name: /^Model:/ }).click();
    await page.getByRole("menuitemradio", { name: /stand-in-markdown:latest/ }).click();
    await box(page).fill("How do I light the stove?");
    await page.getByRole("button", { name: "Send" }).click();

    const reply = replies(page).last();
    await expect(reply.getByRole("button", { name: "Save as a page" })).toBeVisible();
    const body = reply.getByTestId("reply-text");
    await expect(body.getByRole("heading", { name: "Lighting the stove" })).toBeVisible();
    await expect(body.getByRole("columnheader", { name: "Burn time" })).toBeVisible();
    await expect(body.getByRole("listitem")).toHaveCount(2);
    // The model wrote a link, a picture, a script tag and an image with an onerror handler. None of them is one here.
    await expect(body.locator("a, img, script, iframe")).toHaveCount(0);
    await expect(body).toContainText("the maker's site (https://stoves.example/manual?from=outpost)");
    expect(await page.evaluate(() => (window as unknown as { __standInRan?: boolean }).__standInRan)).toBeUndefined();

    await body.getByRole("button", { name: "Copy code" }).click();
    await expect(body.getByText("Copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('stove --prime --wait 30\necho "<b>lit</b>"');

    await reply.getByRole("button", { name: "Save as a page" }).click();
    await page.getByRole("button", { name: "Open it" }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-z]+$/);
    made.push(new URL(page.url()).pathname.split("/").pop()!);
    await expect(page.getByText(/Written by a language model/)).toBeVisible();
    await expect(page.getByText(/written without your library, and not a source/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "Paraffin" })).toBeVisible();
    // In the note too, the model's address is words, and its picture is not fetched.
    await expect(page.locator(".ProseMirror a, .ProseMirror img")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("with the library on, answers from passages and leads to the page they came from", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/chat");
    await page.getByRole("switch", { name: "Use my library" }).click();
    await expect(page.getByTestId("chat-mode")).toContainText(
      "From your library: each message is answered from passages found in your documents",
    );
    await box(page).fill("How should I trim a lamp wick?");
    await box(page).press("Enter");

    const reply = replies(page).last();
    await expect(reply.getByText("from your library")).toBeVisible();
    await expect(reply.getByTestId("reply-text")).toContainText("Trim a lamp wick square before lighting it");
    const passages = reply.getByRole("region", { name: "Passages the model was given" });
    await expect(passages.getByText(/found by searching for “trim lamp wick”/)).toBeVisible();
    await expect(passages.getByText("Cited")).toBeVisible();
    // The switch stays as it was set, for the next message of this conversation.
    await expect(page.getByRole("switch", { name: "Use my library" })).toBeChecked();

    // A marker shows the passage it points to, quoted, beside the claim.
    await reply.getByRole("button", { name: /^Source 1: Lamp oil for chat, Wicks/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Trim a lamp wick square before lighting it. A ragged wick smokes.");
    await page.keyboard.press("Escape");

    // Following a source opens the page of notes it came from, and coming back finds the conversation as it was.
    await passages.getByRole("link", { name: "Lamp oil for chat, Wicks" }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-z]+/);
    await expect(page.getByText("Trim a lamp wick square before lighting it.")).toBeVisible();
    await page.goBack();
    await expect(replies(page).last().getByTestId("reply-text")).toContainText("Trim a lamp wick square");

    // A question the library holds nothing for is not passed to the model as if it did.
    const before = await stats(page);
    await box(page).fill("zeppelin mooring masts");
    await box(page).press("Enter");
    await expect(
      replies(page)
        .last()
        .getByText(/so the model was not asked/),
    ).toBeVisible();
    expect((await stats(page)).chats).toBe(before.chats);
    // The same question, without the library, is the model's own to answer, and the screen says which it is.
    await replies(page).last().getByRole("button", { name: "Ask without my library" }).click();
    await expect(replies(page).last().getByTestId("reply-text")).toContainText("You said “zeppelin mooring masts”");
    await expect(page.getByTestId("chat-mode")).toContainText("A plain conversation");
    expect(errors).toEqual([]);
  });

  test("with the library on, shows a reply that says the passages hold no answer as not covered, citing nothing", async ({ page }) => {
    const errors = watchForErrors(page);
    const model = (await api(page, "GET", "/api/answers/status")).model;
    await api(page, "PATCH", "/api/settings", { "answers.model": "stand-in-declines" });
    await page.goto("/chat");
    await page.getByRole("switch", { name: "Use my library" }).click();
    await box(page).fill("How should I trim a lamp wick?");
    await box(page).press("Enter");
    const reply = replies(page).last();
    await expect(reply.getByTestId("reply-declined")).toContainText("Your library does not seem to cover this.");
    await expect(reply.getByTestId("reply-text")).toContainText("There is no information about that in the provided sources.");
    // The model put markers on its refusal; none is shown, and no passage is marked as cited.
    await expect(reply.getByRole("button", { name: /^Source \d/ })).toHaveCount(0);
    await expect(reply.getByText("Cited", { exact: true })).toHaveCount(0);
    await expect(reply.getByRole("button", { name: /passages? the model read/ })).toBeVisible();
    await api(page, "PATCH", "/api/settings", { "answers.model": model });
    expect(errors).toEqual([]);
  });

  test("asks about one page of notes from that page, and answers from it alone", async ({ page }) => {
    const errors = watchForErrors(page);
    const note = made[0];
    expect(note).toBeTruthy();
    await page.goto(`/notes/${note}`);
    await page.getByRole("button", { name: "Page actions" }).click();
    await page.getByRole("menuitem", { name: "Ask about this page" }).click();
    await expect(page).toHaveURL(/\/chat\?about=note:/);
    await expect(page.getByRole("link", { name: "Lamp oil for chat" }).first()).toBeVisible();
    await expect(page.getByRole("switch", { name: "Use my library" })).toHaveCount(0);
    await expect(page.getByTestId("chat-mode")).toContainText("Each message is answered from passages of Lamp oil for chat alone");
    await box(page).fill("Summarise this");
    await box(page).press("Enter");
    await expect(page.getByRole("textbox", { name: "Name of this conversation" })).toHaveValue("About Lamp oil for chat");
    const reply = replies(page).last();
    await expect(reply.getByTestId("reply-text")).toContainText("Trim a lamp wick square before lighting it");
    await expect(
      reply.getByRole("region", { name: "Passages the model was given" }).getByRole("link", { name: /Lamp oil for chat/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("says in plain words when the model is not on the server, and lets another be chosen", async ({ page }) => {
    const created = await api(page, "POST", "/api/chat/conversations", { model: "llama9:70b", title: "A model that is not there" });
    await page.goto(`/chat/${created.conversation.id}`);
    await expect(page.getByText("This model is not on the model server")).toBeVisible();
    await box(page).fill("Hello");
    await box(page).press("Enter");
    const alert = replies(page).last().getByRole("alert");
    await expect(alert).toContainText("No reply was written");
    await expect(alert).toContainText('has no model called "llama9:70b"');
    await alert.getByRole("button", { name: "Choose another model" }).click();
    await page.getByRole("menuitemradio", { name: /^stand-in:latest/ }).click();
    await replies(page).last().getByRole("button", { name: "Try again" }).click();
    await expect(replies(page).last().getByTestId("reply-text")).toContainText("You said “Hello”");
  });

  test("finds a conversation by name, and deletes one only after asking", async ({ page }) => {
    for (let index = 0; index < 5; index += 1)
      await api(page, "POST", "/api/chat/conversations", { title: `Spare conversation ${index + 1}` });
    await page.goto("/chat");
    const list = page.getByRole("list", { name: "Conversations" });
    await page.getByRole("searchbox", { name: "Find a conversation by name" }).fill("lamp wicks");
    await expect(list.getByRole("link")).toHaveCount(1);
    await expect(list.getByRole("link", { name: /^Lamp wicks/ })).toBeVisible();

    await list.getByRole("button", { name: "Actions for Lamp wicks" }).click();
    await page.getByRole("menuitem", { name: "Delete conversation" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Delete “Lamp wicks”?");
    await expect(dialog).toContainText("removed from this Outpost, on every device");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(list.getByRole("link", { name: /^Lamp wicks/ })).toBeVisible();

    await list.getByRole("button", { name: "Actions for Lamp wicks" }).click();
    await page.getByRole("menuitem", { name: "Delete conversation" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete conversation" }).click();
    await expect(page.getByText(/No conversation has “lamp wicks” in its name/)).toBeVisible();
  });
});
