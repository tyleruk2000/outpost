import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oneList, REFERENCE_SETTLE_MS, useReferenceSearch } from "./reference-search";
import { collectionLine, ownAnswer, ownResult, referenceResult, serveSearch } from "./search-stand-in";

afterEach(() => vi.unstubAllGlobals());

const titlesOf = (list: Array<{ title: string }>) => list.map((result) => result.title);

describe("one list of a person's own results and reference articles", () => {
  const own = [
    { ...ownResult("a", "Car battery note"), score: 0.7 },
    { ...ownResult("b", "Radio manual"), score: 0.64 },
  ];

  it("puts each article where its score falls, at 0.95 of itself, and keeps a person's own in their order", () => {
    const articles = [referenceResult("Mechanics", "Car battery flat", 0.92), referenceResult("Mechanics", "Alternator", 0.4)];
    const list = oneList(own, articles);
    expect(titlesOf(list)).toEqual(["Car battery flat", "Car battery note", "Radio manual", "Alternator"]);
    expect(list[0]!.score).toBe(0.874);
  });

  it("lets a page the person kept win a near tie", () => {
    expect(titlesOf(oneList(own, [referenceResult("Mechanics", "Close call", 0.72)]))[0]).toBe("Car battery note");
  });

  it("takes at most so many articles, and with a floor only those above it", () => {
    const articles = [referenceResult("M", "One", 0.9), referenceResult("M", "Two", 0.8), referenceResult("M", "Three", 0.2)];
    expect(titlesOf(oneList(own, articles, { most: 1 }))).toEqual(["One", "Car battery note", "Radio manual"]);
    expect(titlesOf(oneList(own, articles, { above: 0.64 }))).toEqual(["One", "Two", "Car battery note", "Radio manual"]);
  });
});

describe("searching reference collections while a person types", () => {
  it("asks once the words have stood still, not once a letter, and cancels what was typed over", async () => {
    const server = serveSearch(() => ownAnswer([]));
    const { rerender } = renderHook(({ q }) => useReferenceSearch(q, true), { initialProps: { q: "car v" } });
    for (const q of ["car va", "car vat", "car batt", "car battery"]) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      rerender({ q });
    }
    expect(server.reference).toHaveLength(0);
    await waitFor(() => expect(server.reference).toHaveLength(1), { timeout: REFERENCE_SETTLE_MS * 4 });
    expect(server.reference[0]!.q).toBe("car battery");
    await new Promise((resolve) => setTimeout(resolve, REFERENCE_SETTLE_MS + 50));
    expect(server.reference).toHaveLength(1);
  });

  it("shows a search just finished at once when it is come back to, without asking again", async () => {
    const server = serveSearch(() => ownAnswer([]));
    const first = renderHook(() => useReferenceSearch("lamp oil", true, false, false, 0));
    await waitFor(() => expect(server.reference).toHaveLength(1));
    await server.send({ type: "start", collections: 1 }, collectionLine("Wikipedia", "Lamp oil"));
    await server.end({ searched: 1 });
    await waitFor(() => expect(first.result.current.status).toBe("done"));
    first.unmount();
    // Back to the search: the same articles in the first frame, and nothing asked.
    const again = renderHook(() => useReferenceSearch("lamp oil", true, false, false, 0));
    expect(again.result.current.status).toBe("done");
    expect(again.result.current.results.map((result) => result.title)).toEqual(["Lamp oil"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.reference).toHaveLength(1);
  });

  it("says it is searching while it waits, so that the page does not look finished", () => {
    serveSearch(() => ownAnswer([]));
    const { result } = renderHook(() => useReferenceSearch("water", true));
    expect(result.current.status).toBe("searching");
  });
});
