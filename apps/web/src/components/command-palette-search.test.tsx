import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionLine, ownAnswer, ownResult, serveSearch } from "@/lib/search-stand-in";
import { ThemeProvider } from "@/lib/theme";
import { CommandPalette } from "./command-palette";

afterEach(() => vi.unstubAllGlobals());

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter>
          <CommandPalette open onOpenChange={() => {}} onNewPage={() => {}} />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const OWN = [ownResult("d1", "Bowline practice"), ownResult("n1", "Bowline notes", "note")];
/** The names of the things that can be chosen, top to bottom. */
const options = () => screen.getAllByRole("option").map((option) => option.textContent);
const selected = () => document.querySelector('[cmdk-item][data-selected="true"]');

describe("the palette, with reference collections answering later", () => {
  it("lists a person's own matches at once and says reference collections are still being searched", async () => {
    const user = userEvent.setup();
    const server = serveSearch(() => ownAnswer(OWN));
    show();
    await user.type(screen.getByPlaceholderText(/Search your library/), "bowline");

    expect(await screen.findByRole("option", { name: /Bowline practice/ })).toBeInTheDocument();
    expect(server.asked.at(-1)!.get("reference")).toBe("later");
    await waitFor(() => expect(server.reference.at(-1)?.q).toBe("bowline"));
    expect(screen.getByText("Still searching reference collections…")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Searching" })).toBeInTheDocument();
  });

  it("adds reference articles at the end when they come, leaving the rest and the selection where they were", async () => {
    const user = userEvent.setup();
    const server = serveSearch(() => ownAnswer(OWN));
    show();
    await user.type(screen.getByPlaceholderText(/Search your library/), "bowline");
    await screen.findByRole("option", { name: /Bowline practice/ });
    await waitFor(() => expect(server.reference.at(-1)?.q).toBe("bowline"));
    await user.keyboard("{ArrowDown}");
    const before = options();
    const chosen = selected();
    expect(chosen?.textContent).toContain("Bowline practice");

    await server.send({ type: "start", collections: 2 }, collectionLine("Knots", "Portuguese bowline", "Running bowline"));
    expect(screen.getByText("In reference collections")).toBeInTheDocument();
    // One line for each collection, its best match, after everything that was there.
    expect(options()).toEqual([...before, expect.stringContaining("Portuguese bowline")]);
    expect(options().at(-1)).toContain("Knots");
    expect(selected()).toBe(chosen);
    expect(screen.getByText("Still searching reference collections… 1 of 2 searched.")).toBeInTheDocument();

    await server.send(collectionLine("Wikivoyage", "Bowline Bay"));
    await server.end({ searched: 2 });
    expect(options()).toEqual([...before, expect.stringContaining("Portuguese bowline"), expect.stringContaining("Bowline Bay")]);
    expect(selected()).toBe(chosen);
    expect(screen.queryByText(/Still searching/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Searching" })).not.toBeInTheDocument();
  });

  it("does not say nothing matches until reference collections have answered too", async () => {
    const user = userEvent.setup();
    const server = serveSearch(() => ownAnswer([]));
    show();
    await user.type(screen.getByPlaceholderText(/Search your library/), "sheepshank");
    await waitFor(() => expect(server.reference.at(-1)?.q).toBe("sheepshank"));
    expect(screen.getByText("Still searching reference collections…")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing in your library matches/)).not.toBeInTheDocument();

    await server.send({ type: "start", collections: 1 }, collectionLine("Knots"));
    await server.end({ searched: 1 });
    expect(screen.getByText(/Nothing in your library matches “sheepshank”/)).toBeInTheDocument();
  });

  it("drops the search of reference collections when more is typed", async () => {
    const user = userEvent.setup();
    const server = serveSearch(() => ownAnswer(OWN));
    show();
    const input = screen.getByPlaceholderText(/Search your library/);
    await user.type(input, "bow");
    await waitFor(() => expect(server.reference.at(-1)?.q).toBe("bow"));
    const first = server.reference.at(-1)!;
    await user.type(input, "line");
    await waitFor(() => expect(server.reference.at(-1)?.q).toBe("bowline"));
    expect(first.signal?.aborted).toBe(true);
    expect(server.reference.at(-1)!.signal?.aborted).toBe(false);
  });
});
