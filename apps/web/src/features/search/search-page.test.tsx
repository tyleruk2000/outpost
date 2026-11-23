import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionLine, ownAnswer, ownResult, serveSearch } from "@/lib/search-stand-in";
import SearchPage from "./search-page";

afterEach(() => vi.unstubAllGlobals());

function show(address: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const OWN = [ownResult("d1", "Water purification"), ownResult("n1", "Water kit", "note")];
const titles = () => screen.getAllByRole("heading").map((heading) => heading.textContent);
const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("what can be opened now, and what would have to be downloaded", () => {
  const CATALOG = [
    ownResult("c1", "Water Treatment Library", "catalog"),
    ownResult("c2", "Water Disinfection in the Mountains", "catalog"),
  ];

  it("lists a person's own results first and what is to download last, after the reference collections have answered", async () => {
    // As an older server might send them, best match first whatever it is.
    const server = serveSearch(() => ownAnswer([...CATALOG, ownResult("n1", "Kit for a power cut", "note")]));
    show("/search?q=safe%20drinking%20water");
    expect(await screen.findByRole("link", { name: "Kit for a power cut" })).toBeInTheDocument();
    // Not yet: it would be pushed down when the articles of reference collections come.
    expect(screen.queryByRole("heading", { name: "Available to download" })).not.toBeInTheDocument();
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 1 }, collectionLine("Wikipedia", "Drinking water"));
    await server.end({ searched: 1 });
    expect(titles()).toEqual([
      "Search",
      "Go to",
      "Kit for a power cut",
      "In reference collections",
      "Drinking water",
      "Available to download",
      "Water Treatment Library",
      "Water Disinfection in the Mountains",
    ]);
  });

  it("offers the screen that answers the words, as the quick search does", async () => {
    serveSearch(() => ownAnswer([], { referenceToCome: false }));
    show("/search?q=safe%20drinking%20water");
    const goTo = await screen.findByRole("region", { name: "Go to" });
    const water = within(goTo).getByRole("link", { name: /Tools: Water/ });
    expect(water).toHaveAttribute("href", "/tools/water");
    // With what it is for, so that it is plain why it is offered.
    expect(water).toHaveTextContent(/making water safe to drink/);
  });

  it("offers no screen where none fits, and none on another tab", async () => {
    serveSearch(() => ownAnswer([], { referenceToCome: false }));
    show("/search?q=torch");
    expect(await screen.findByRole("heading", { name: "Nothing matches “torch”" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Go to" })).not.toBeInTheDocument();
  });

  it("keeps what is to download in the list on its own tab", async () => {
    serveSearch(() => ownAnswer(CATALOG, { referenceToCome: false }));
    show("/search?q=water&kind=catalog");
    expect(await screen.findByRole("link", { name: "Water Treatment Library" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Available to download" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Go to" })).not.toBeInTheDocument();
  });

  it("is one stop for Tab, whose arrow keys move along the kinds, each named with its count", async () => {
    const user = userEvent.setup();
    serveSearch(() => ownAnswer(CATALOG, { referenceToCome: false }));
    show("/search?q=water");
    const everything = await screen.findByRole("tab", { name: "Everything" });
    const toDownload = await screen.findByRole("tab", { name: /^Available to download/ });
    // The count is not run into the name ("Available to download2"); jsdom drops the space a browser keeps.
    expect(toDownload).toHaveAccessibleName(/^Available to download, ?2$/);
    expect(everything).toHaveAttribute("tabindex", "0");
    // Nothing is explained only in a hover title.
    expect(document.querySelector("[title]")).toBeNull();
    expect(toDownload).toHaveAttribute("tabindex", "-1");
    everything.focus();
    await user.keyboard("{ArrowRight}");
    expect(toDownload).toHaveFocus();
    expect(toDownload).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Everything" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("the search page, with reference collections answering later", () => {
  it("shows a person's own results at once and says reference collections are still being searched", async () => {
    const server = serveSearch(() => ownAnswer(OWN));
    show("/search?q=water");

    expect(await screen.findByRole("link", { name: "Water purification" })).toBeInTheDocument();
    // Asked for apart, so that these never wait.
    expect(server.asked[0]!.get("reference")).toBe("later");
    await waitFor(() => expect(server.reference).toHaveLength(1));
    expect(server.reference[0]!.q).toBe("water");
    // Nothing has come from any collection, and the page says so rather than looking finished.
    expect(screen.getAllByText("Still searching reference collections…").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "In reference collections" })).toBeInTheDocument();
    expect(tab(/^Reference$/)).toBeInTheDocument();

    await server.send({ type: "start", collections: 3 });
    expect(screen.getAllByText("Still searching reference collections… 0 of 3 searched.").length).toBeGreaterThan(0);
  });

  it("adds each collection's articles below as they come, without moving what is already there", async () => {
    const server = serveSearch(() => ownAnswer(OWN));
    show("/search?q=water");
    const first = await screen.findByRole("link", { name: "Water purification" });
    const second = screen.getByRole("link", { name: "Water kit" });
    const status = screen.getAllByRole("status")[0]!;
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 3 });

    await server.send(collectionLine("Appropedia", "Water filter", "Rainwater"));
    expect(titles()).toEqual(["Search", "Go to", "Water purification", "Water kit", "In reference collections", "Water filter"]);
    expect(screen.getAllByText("Still searching reference collections… 1 of 3 searched.").length).toBeGreaterThan(0);

    await server.send(collectionLine("Wikivoyage"), collectionLine("Knots", "Water knot"));
    // The newcomer goes to the end; the best match of each collection is shown, not every article.
    expect(titles()).toEqual([
      "Search",
      "Go to",
      "Water purification",
      "Water kit",
      "In reference collections",
      "Water filter",
      "Water knot",
    ]);
    // The very same elements, where they were: nothing was drawn again or reordered.
    expect(screen.getByRole("link", { name: "Water purification" })).toBe(first);
    expect(screen.getByRole("link", { name: "Water kit" })).toBe(second);
    expect(
      first.compareDocumentPosition(screen.getByRole("link", { name: "Water filter" })) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole("status")[0]).toBe(status);

    await server.end({ searched: 3 });
    expect(screen.queryByText(/Still searching/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 articles in reference collections" })).toBeInTheDocument();
    expect(within(tab(/^Reference/)).getByText("3")).toBeInTheDocument();
    // The counts of a person's own kinds are the server's, untouched by what came later.
    expect(within(tab(/^Documents/)).getByText("1")).toBeInTheDocument();
    expect(within(tab(/^Pages/)).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all 3 reference results" })).toBeInTheDocument();
  });

  it("names the collections that are missing from the results", async () => {
    const server = serveSearch(() => ownAnswer(OWN));
    show("/search?q=water");
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 4 }, collectionLine("Knots", "Water knot"));
    await server.end({
      searched: 1,
      missing: [
        { collectionId: "a", title: "Appropedia", reason: "slow" },
        { collectionId: "b", title: "Wikivoyage", reason: "slow" },
        { collectionId: "c", title: "Old archive", reason: "failed" },
      ],
    });
    expect(
      screen.getByText(
        "Appropedia and Wikivoyage were not searched in time, so their articles are missing from these results. Search again to give them longer.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Old archive could not be searched, so its articles are missing from these results.")).toBeInTheDocument();
    expect(screen.getByText(/3 collections are missing; see below\./)).toBeInTheDocument();
  });

  it("says why when reference collections could not be searched at all", async () => {
    const server = serveSearch(() => ownAnswer(OWN));
    show("/search?q=water");
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 0 });
    await server.end({ message: "kiwix-serve is starting." });
    expect(screen.getByText("kiwix-serve is starting.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Water purification" })).toBeInTheDocument();
  });

  it("does not call the page empty while reference collections may still have something", async () => {
    const server = serveSearch(() => ownAnswer([]));
    show("/search?q=bowline");
    expect(await screen.findByText("Nothing of your own matches “bowline”.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Nothing matches/ })).not.toBeInTheDocument();
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 2 }, collectionLine("Knots"), collectionLine("Wikivoyage"));
    await server.end({ searched: 2 });
    expect(screen.getByRole("heading", { name: "Nothing matches “bowline”" })).toBeInTheDocument();
  });

  it("drops the search of reference collections when the person types something else", async () => {
    const user = userEvent.setup();
    const server = serveSearch(() => ownAnswer(OWN));
    show("/search?q=wat");
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 3 }, collectionLine("Knots", "Water knot"));
    expect(screen.getByRole("link", { name: "Water knot" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "er");
    await waitFor(() => expect(server.reference).toHaveLength(2));
    expect(server.reference[0]!.signal?.aborted).toBe(true);
    expect(server.reference[1]).toMatchObject({ q: "water" });
    expect(server.reference[1]!.signal?.aborted).toBe(false);
    // What the old search found is not passed off as an answer to the new one.
    expect(screen.queryByRole("link", { name: "Water knot" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Still searching reference collections…").length).toBeGreaterThan(0);
  });

  it("lists every reference article under its own tab, a page at a time", async () => {
    const user = userEvent.setup();
    const server = serveSearch(() => ownAnswer(OWN));
    show("/search?q=water");
    await waitFor(() => expect(server.reference).toHaveLength(1));
    const articles = Array.from({ length: 23 }, (_, index) => `Article ${String(index + 1).padStart(2, "0")}`);
    await server.send({ type: "start", collections: 1 }, collectionLine("Appropedia", ...articles));
    await server.end({ searched: 1 });

    await user.click(tab(/^Reference/));
    // The same search: nothing is asked of the collections again.
    expect(server.reference).toHaveLength(1);
    expect(screen.getByText("23 articles in reference collections.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(articles.slice(0, 20));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(articles.slice(20));
    expect(screen.queryByRole("link", { name: "Water purification" })).not.toBeInTheDocument();
  });

  it("asks nothing of reference collections when there are none to search", async () => {
    const server = serveSearch(() => ownAnswer(OWN, { referenceToCome: false }));
    show("/search?q=water");
    expect(await screen.findByRole("link", { name: "Water purification" })).toBeInTheDocument();
    expect(server.reference).toHaveLength(0);
    expect(screen.queryByText(/reference collections/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Reference/ })).not.toBeInTheDocument();
  });
});

describe("why each result is there", () => {
  const place = { ...ownResult("p1", "Waterfields", "map-feature"), subtitle: "Farm, United Kingdom", url: "/maps?feature=1" };

  it("says so in words, says when results lack a word, names the words left out, and keeps places apart", async () => {
    const results = [
      { ...ownResult("d1", "Soda bread"), why: "All 2 words, side by side" },
      { ...ownResult("n1", "Buttermilk", "note"), why: "1 of 2 words" },
    ];
    serveSearch(() => ownAnswer(results, { referenceToCome: false, relaxed: true, everyWord: 1, ignored: ["how", "to"], places: [place] }));
    show("/search?q=how%20to%20bread%20buttermilk");
    expect(await screen.findByText("All 2 words, side by side")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 words")).toBeInTheDocument();
    expect(screen.queryByText(/% match/)).not.toBeInTheDocument();
    expect(screen.getByText("Only 1 result has every word; results with some of them follow.")).toBeInTheDocument();
    expect(screen.getByText(/Left out of the search, as words that only shape a question: “how”, “to”/)).toBeInTheDocument();
    const strip = screen.getByRole("region", { name: "Places and repeaters" });
    expect(within(strip).getByRole("link", { name: /Waterfields/ })).toHaveAttribute("href", "/maps?feature=1");
    // After the results, since the words are not a place's name.
    expect(titles().indexOf("Places and repeaters")).toBeGreaterThan(titles().indexOf("Buttermilk"));
  });

  it("puts places first when the words are one of their names, and says when no result has every word", async () => {
    serveSearch(() =>
      ownAnswer([ownResult("n1", "Water kit", "note")], {
        referenceToCome: false,
        relaxed: true,
        everyWord: 0,
        places: [place],
        placesFirst: true,
      }),
    );
    show("/search?q=waterfields");
    expect(await screen.findByText("No result has every word; showing results with some.")).toBeInTheDocument();
    expect(titles().indexOf("Places and repeaters")).toBeLessThan(titles().indexOf("Water kit"));
  });
});
