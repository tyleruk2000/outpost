import { GUIDE_SYSTEMS, guideInline, guideMarkdown, RECOMMENDED_MODELS, SETUP_GUIDE, SETUP_GUIDE_PATH } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import SetupGuidePage, { likelySystem } from "./setup-guide-page";

function show(os: "macos" | "linux" | "windows" | "other" = "macos") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/system") {
        return new Response(JSON.stringify({ host: { os, inContainer: false } }), { headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[SETUP_GUIDE_PATH]}>
        <SetupGuidePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the set-up guide, inside Outpost", () => {
  it("has every part of the guide, in the guide's order, each with an address of its own", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Setting up search by meaning, answers and chat" })).toBeVisible();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => [heading.id, heading.textContent]);
    expect(headings).toEqual(SETUP_GUIDE.sections.map((section) => [section.id, section.title]));
    expect(headings.map(([id]) => id)).toEqual([
      "search-by-meaning",
      "answers-and-chat",
      "another-computer",
      "docker",
      "when-it-does-not-work",
      "other-servers",
      "checked",
    ]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.id)).toEqual([
      "get-ollama",
      "get-a-model",
      "back-to-outpost",
    ]);
    // The list at the top leads to each part.
    const contents = screen.getByRole("navigation", { name: "On this page" });
    expect(within(contents).getByRole("link", { name: "Search by meaning" })).toHaveAttribute("href", "#search-by-meaning");
    expect(within(contents).getByRole("link", { name: "Three things that go wrong, and the fix" })).toHaveAttribute(
      "href",
      "#when-it-does-not-work",
    );
  });

  it("gives search by meaning in three numbered steps, with a link to the switch", () => {
    show();
    const part = screen.getByRole("region", { name: "Search by meaning" });
    const steps = within(part).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[1]).toHaveTextContent("Turn the switch on.");
    expect(steps[2]).toHaveTextContent("It is done when it says Search now also finds things by meaning.");
    expect(within(part).getByRole("link", { name: "Open Search by meaning in Settings" })).toHaveAttribute(
      "href",
      "/settings#semantic-title",
    );
  });

  it("says which steps need the internet, and opens Ollama's download page in the browser", () => {
    show();
    const getOllama = screen.getByRole("region", { name: "Step 1: get Ollama" });
    expect(within(getOllama).getByText("This step needs the internet")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Step 2: get a model" })).getByText("This step needs the internet")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Step 3: come back to Outpost" })).queryByText("This step needs the internet"),
    ).toBeNull();
    const download = within(getOllama).getByRole("link", { name: /ollama\.com\/download/ });
    expect(download).toHaveAttribute("href", "https://ollama.com/download");
    expect(download).toHaveAttribute("target", "_blank");
    expect(download).toHaveAttribute("rel", "noreferrer");
  });

  it("shows the steps for one kind of computer at a time, beginning with the kind Outpost itself runs on", async () => {
    show("macos");
    const getOllama = screen.getByRole("region", { name: "Step 1: get Ollama" });
    const choice = within(getOllama).getByRole("radiogroup", { name: "The computer Ollama runs on" });
    expect(
      within(choice)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(GUIDE_SYSTEMS.map((system) => system.name));
    expect(await within(choice).findByRole("radio", { name: "Mac" })).toBeChecked();
    expect(getOllama).toHaveTextContent("drag Ollama into the Applications folder");
    expect(getOllama).not.toHaveTextContent("OllamaSetup.exe");

    await userEvent.click(within(choice).getByRole("radio", { name: "Raspberry Pi" }));
    expect(getOllama).toHaveTextContent("with the 64-bit Raspberry Pi OS");
    expect(getOllama).toHaveTextContent("4 GB is enough for the smallest models");
    expect(within(getOllama).getByText("curl -fsSL https://ollama.com/install.sh | sh")).toBeVisible();
    expect(getOllama).not.toHaveTextContent("Applications folder");
    // The choice carries to the other parts that differ by computer.
    expect(screen.getByRole("region", { name: "When Ollama is on a different computer from Outpost" })).toHaveTextContent(
      "sudo systemctl edit ollama.service",
    );

    await userEvent.click(within(choice).getByRole("radio", { name: "Windows" }));
    expect(getOllama).toHaveTextContent("OllamaSetup.exe");
    expect(screen.getByRole("region", { name: "Step 2: get a model" })).toHaveTextContent("type Windows PowerShell");
  });

  it("begins with Linux when that is what Outpost runs on", async () => {
    show("linux");
    const choice = within(screen.getByRole("region", { name: "Step 1: get Ollama" })).getByRole("radiogroup");
    await waitFor(() => expect(within(choice).getByRole("radio", { name: "Linux" })).toBeChecked());
    expect(likelySystem(undefined)).toBe("mac");
    expect(likelySystem({ host: { os: "windows", inContainer: false } })).toBe("windows");
  });

  it("gives the exact command for the model to start with, the short list of small models, and the buttons by name", () => {
    show();
    const getModel = screen.getByRole("region", { name: "Step 2: get a model" });
    expect(within(getModel).getByText("ollama pull lfm3:1.7b")).toBeVisible();
    expect(within(getModel).getByRole("button", { name: "Copy: ollama pull lfm3:1.7b" })).toBeEnabled();
    expect(within(getModel).getByText("ollama ls")).toBeVisible();
    const rows = within(within(getModel).getByRole("list", { name: "Recommended small models" })).getAllByRole("listitem");
    expect(rows).toHaveLength(RECOMMENDED_MODELS.length);
    expect(rows[0]).toHaveTextContent("lfm3:1.7b");
    expect(rows[0]).toHaveTextContent("Start with this one");
    expect(getModel).toHaveTextContent("lfm3:1.7b is the one to start with, and a computer with 4 GB of memory can hold it.");

    const back = screen.getByRole("region", { name: "Step 3: come back to Outpost" });
    expect(back).toHaveTextContent("Press Look for Ollama on this computer.");
    expect(back).toHaveTextContent("Press Use this model.");
    expect(back).toHaveTextContent("Press Try it.");
    expect(within(back).getByRole("link", { name: "Open Answers from your library in Settings" })).toHaveAttribute(
      "href",
      "/settings#answers-title",
    );
  });

  it("covers another computer, Docker, three things that go wrong, and other servers", () => {
    show();
    const other = screen.getByRole("region", { name: "When Ollama is on a different computer from Outpost" });
    expect(other).toHaveTextContent("set OLLAMA_HOST to 0.0.0.0:11434");
    expect(within(other).getByText('launchctl setenv OLLAMA_HOST "0.0.0.0:11434"')).toBeVisible();
    expect(other).toHaveTextContent("http://192.168.1.20:11434/v1");
    expect(other).toHaveTextContent("Ollama has no password");

    const docker = screen.getByRole("region", { name: "When Outpost runs in Docker" });
    expect(docker).toHaveTextContent("host.docker.internal");
    expect(within(docker).getByText(/host\.docker\.internal:host-gateway/)).toBeVisible();

    const wrong = screen.getByRole("region", { name: "Three things that go wrong, and the fix" });
    expect(within(wrong).getAllByRole("listitem")).toHaveLength(3);
    expect(wrong).toHaveTextContent("Outpost says: “Ollama was not found”");
    expect(wrong).toHaveTextContent("The fix: Start it.");

    const servers = screen.getByRole("region", { name: "Other model servers" });
    expect(servers).toHaveTextContent("http://127.0.0.1:9931/v1");
    expect(servers).toHaveTextContent("http://127.0.0.1:1234/v1");
    expect(servers).toHaveTextContent("Neither has been tried with Outpost.");
  });

  it("says when and where its facts were checked, and what was and was not tried", () => {
    show();
    const checked = screen.getByRole("region", { name: "Where this was checked" });
    expect(checked).toHaveTextContent("read from its publisher's own pages on 16 November 2026");
    expect(within(checked).getByRole("link", { name: "Ollama: questions and answers" })).toHaveAttribute(
      "href",
      "https://docs.ollama.com/faq",
    );
    expect(checked).toHaveTextContent("What was not tried:");
    for (const anchor of within(checked).getAllByRole("link")) {
      expect(anchor.getAttribute("href")).toMatch(/^https:\/\//);
      expect(anchor).toHaveAttribute("target", "_blank");
    }
  });
});

describe("the guide's one source", () => {
  it("reads the three marks, and nothing else, out of a sentence", () => {
    expect(guideInline("Press **Try it**, type `ollama ls`, or open [the library](https://ollama.com/library).")).toEqual([
      { type: "text", text: "Press " },
      { type: "strong", text: "Try it" },
      { type: "text", text: ", type " },
      { type: "code", text: "ollama ls" },
      { type: "text", text: ", or open " },
      { type: "link", text: "the library", url: "https://ollama.com/library" },
      { type: "text", text: "." },
    ]);
    // A link that is not to the web is left as words: the guide never links by anything but https.
    expect(guideInline("[x](javascript:alert(1))")).toEqual([{ type: "text", text: "[x](javascript:alert(1))" }]);
  });

  it("writes the same parts, in the same order, as a page for the documentation", () => {
    const page = guideMarkdown();
    const titles = [...page.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(titles).toEqual(SETUP_GUIDE.sections.map((section) => section.title));
    expect(page).toContain("```\n   ollama pull lfm3:1.7b\n   ```");
    expect(page).toContain("#### Raspberry Pi");
    for (const model of RECOMMENDED_MODELS) expect(page).toContain(`| \`${model.name}\` | ${model.download} |`);
  });

  it("names the buttons as the screens name them", () => {
    // If a button is renamed, this guide must be too. The screens' own tests press the buttons by these names.
    const page = guideMarkdown();
    for (const label of [
      "**Search by meaning**",
      "**Search now also finds things by meaning**",
      "**Answers from your library**",
      "**Look for Ollama on this computer**",
      "**Use this model**",
      "**Try it**",
      "**More options**",
      "**Server address**",
      "**Answer from my library**",
    ]) {
      expect(page, label).toContain(label);
    }
  });
});
