/**
 * The audiobook player's states, the Library's list of audiobooks, and the LibriVox
 * shelf in Explore. jsdom has no sound, so the `<audio>` element's methods are stubbed
 * and its events are sent by hand, as a browser would send them.
 */
import type { AudiobookDto, LibrivoxShelfResponse } from "@outpost/shared";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServer, installBrowserStubs, renderScreen } from "../downloads/test-support";
import { byline, clockTime, factsLine, runningTime } from "./audiobook-data";
import AudiobookList from "./audiobook-list";
import { AudiobookPlayer } from "./audiobook-player";
import { LibrivoxShelf } from "./librivox-shelf";
import { readPlace, savePlace } from "./place";
import { SAVE_EVERY_MS } from "./player";

const chapter = (n: number, over: Partial<AudiobookDto["chapters"][number]> = {}) => ({
  documentId: `d${n}`,
  title: `Chapter ${n} title`,
  fileUrl: `/api/documents/d${n}/file`,
  mime: "audio/mpeg",
  ext: "mp3",
  sizeBytes: 1000,
  seconds: 600,
  ...over,
});

const book = (over: Partial<AudiobookDto> = {}): AudiobookDto => ({
  id: "b1",
  kind: "book",
  collectionId: "b1",
  title: "Art of War",
  author: "Sun Tzu",
  readers: ["Moira Fogarty"],
  licence: "Public domain in the United States",
  licenceNote: "LibriVox: not necessarily in other countries.",
  sourceUrl: "https://librivox.org/the-art-of-war-by-sun-tzu/",
  librivoxId: "119",
  totalSeconds: 1800,
  sizeBytes: 3_000_000,
  chapters: [chapter(1), chapter(2), chapter(3)],
  locationAvailable: true,
  addedAt: 1,
  ...over,
});

let play: ReturnType<typeof vi.fn>;
let canPlay = "maybe";

beforeAll(installBrowserStubs);
beforeEach(() => {
  window.localStorage.clear();
  canPlay = "maybe";
  play = vi.fn(function (this: HTMLAudioElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: false });
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLAudioElement) {
    Object.defineProperty(this, "paused", { configurable: true, value: true });
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation(() => canPlay as CanPlayTypeResult);
});
afterEach(() => {
  // Unmounted while the element's methods are still stubbed: jsdom has none of its own.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const audio = () => document.querySelector("audio")!;

/** What the browser does once it knows a file's length. */
function loaded(duration = 600) {
  Object.defineProperty(audio(), "duration", { configurable: true, value: duration });
  act(() => {
    audio().dispatchEvent(new Event("loadedmetadata"));
  });
}

function at(seconds: number) {
  act(() => {
    audio().currentTime = seconds;
    audio().dispatchEvent(new Event("timeupdate"));
  });
}

describe("the words for time", () => {
  it("speaks a running time to the minute and shows a position as a clock", () => {
    expect(runningTime(4334)).toBe("1 hour 12 minutes");
    expect(runningTime(3600)).toBe("1 hour");
    expect(runningTime(20)).toBe("1 minute");
    expect(runningTime(null)).toBeNull();
    expect(clockTime(724)).toBe("12:04");
    expect(clockTime(3729)).toBe("1:02:09");
    expect(byline({ author: "Sun Tzu", readers: ["A", "B", "C", "D"] })).toBe("By Sun Tzu, read by A, B and 2 others");
    expect(factsLine({ chapterCount: 7, totalSeconds: 4334, sizeBytes: 35_000_000 })).toMatch(/^7 chapters, 1 hour 12 minutes, 35/);
  });
});

describe("the player", () => {
  it("starts at the first chapter, plays, pauses and keeps the place on this device", async () => {
    renderScreen(<AudiobookPlayer book={book()} />);
    expect(screen.getByText("Chapter 1 of 3")).toBeInTheDocument();
    expect(audio().getAttribute("src")).toBe("/api/documents/d1/file");
    loaded();

    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    at(42);
    expect(screen.getByText("0:42")).toBeInTheDocument();
    expect(screen.getByText("−9:18")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(readPlace("b1")).toMatchObject({ documentId: "d1", seconds: 42 });
  });

  it("goes back and forward thirty seconds, and changes speed, remembered for next time", async () => {
    renderScreen(<AudiobookPlayer book={book()} />);
    loaded();
    at(100);
    await userEvent.click(screen.getByRole("button", { name: "Forward 30 seconds" }));
    expect(audio().currentTime).toBe(130);
    await userEvent.click(screen.getByRole("button", { name: "Back 30 seconds" }));
    expect(audio().currentTime).toBe(100);
    at(10);
    await userEvent.click(screen.getByRole("button", { name: "Back 30 seconds" }));
    expect(audio().currentTime).toBe(0);

    await userEvent.click(screen.getByRole("combobox", { name: "Playing speed" }));
    await userEvent.click(screen.getByRole("option", { name: "1.5×" }));
    expect(audio().playbackRate).toBe(1.5);
    expect(window.localStorage.getItem("outpost.audiobooks.speed")).toBe("1.5");
  });

  it("keeps the place when the screen is left while playing", async () => {
    const view = renderScreen(<AudiobookPlayer book={book()} />);
    loaded();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    at(50);
    view.unmount();
    expect(readPlace("b1")).toMatchObject({ documentId: "d1", seconds: 50 });
  });

  it("keeps nothing when a book is only opened and left", () => {
    const view = renderScreen(<AudiobookPlayer book={book()} />);
    loaded();
    view.unmount();
    expect(readPlace("b1")).toBeUndefined();
  });

  it("resumes where this device left off", () => {
    savePlace("b1", "d2", 125);
    renderScreen(<AudiobookPlayer book={book()} />);
    expect(screen.getByText(/Chapter 2 of 3\. Picks up where you left off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toHaveTextContent("Resume");
    expect(audio().getAttribute("src")).toBe("/api/documents/d2/file");
    loaded();
    expect(audio().currentTime).toBe(125);
  });

  it("opens at a chapter asked for, from its start unless it is where the book was left", () => {
    savePlace("b1", "d2", 125);
    renderScreen(<AudiobookPlayer book={book()} startAt="d3" />);
    expect(screen.getByText(/^Chapter 3 of 3/)).toBeInTheDocument();
    loaded();
    expect(audio().currentTime).toBe(0);
  });

  it("follows on to the next chapter, and starts again from the beginning once the book is done", async () => {
    renderScreen(<AudiobookPlayer book={book()} />);
    loaded();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      audio().dispatchEvent(new Event("ended"));
    });
    expect(screen.getByText("Chapter 2 of 3")).toBeInTheDocument();
    expect(audio().getAttribute("src")).toBe("/api/documents/d2/file");
    expect(play).toHaveBeenCalledTimes(2);
    expect(readPlace("b1")).toMatchObject({ documentId: "d2", seconds: 0 });

    // A chapter from the list plays at once.
    await userEvent.click(screen.getByRole("button", { name: /Chapter 3 title/ }));
    expect(screen.getByText("Chapter 3 of 3")).toBeInTheDocument();
    act(() => {
      audio().dispatchEvent(new Event("ended"));
    });
    expect(screen.getByText(/Finished: play to hear it again/)).toBeInTheDocument();
    expect(readPlace("b1")).toBeUndefined();
  });

  it("saves at most every few seconds while playing, and when the page is hidden", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    renderScreen(<AudiobookPlayer book={book()} />);
    loaded();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    at(1);
    expect(readPlace("b1")?.seconds).toBe(1);
    at(2);
    expect(readPlace("b1")?.seconds).toBe(1);
    now.mockReturnValue(1_000_000 + SAVE_EVERY_MS);
    at(6);
    expect(readPlace("b1")?.seconds).toBe(6);

    at(7);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(readPlace("b1")?.seconds).toBe(7);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  it("says plainly when this browser cannot play a file, and offers it to download", () => {
    canPlay = "";
    renderScreen(<AudiobookPlayer book={book({ chapters: [chapter(1, { ext: "ogg", mime: "audio/ogg" })] })} />);
    expect(screen.getByText(/This browser cannot play Ogg files/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download this chapter/ })).toHaveAttribute("href", "/api/documents/d1/file?download=1");
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("says so when a chapter could not be loaded", () => {
    renderScreen(<AudiobookPlayer book={book()} />);
    Object.defineProperty(audio(), "error", { configurable: true, value: { code: 2 } });
    act(() => {
      audio().dispatchEvent(new Event("error"));
    });
    expect(screen.getByText(/could not be loaded from Outpost/)).toBeInTheDocument();
  });

  it("says when the book's storage is away, and states its licence as LibriVox does", () => {
    renderScreen(<AudiobookPlayer book={book({ locationAvailable: false })} />);
    expect(screen.getByText("The storage holding this book is not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByText(/Public domain in the United States\./)).toBeInTheDocument();
    expect(screen.getByText(/Elsewhere it depends on the country/)).toBeInTheDocument();
  });

  it("gives the lock screen the chapter's name and its buttons, where the browser has them", () => {
    const handlers = new Map<string, unknown>();
    const session = {
      metadata: null as unknown,
      playbackState: "none",
      setActionHandler: (name: string, handler: unknown) => handlers.set(name, handler),
      setPositionState: vi.fn(),
    };
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaSession: session }));
    vi.stubGlobal(
      "MediaMetadata",
      class {
        init: Record<string, string>;
        constructor(init: Record<string, string>) {
          this.init = init;
        }
      },
    );
    renderScreen(<AudiobookPlayer book={book()} />);
    expect((session.metadata as { init: Record<string, string> }).init).toEqual({
      title: "Chapter 1 title",
      artist: "Sun Tzu",
      album: "Art of War",
    });
    expect([...handlers.keys()].sort()).toEqual(["nexttrack", "pause", "play", "previoustrack", "seekbackward", "seekforward", "seekto"]);
    loaded();
    act(() => (handlers.get("nexttrack") as () => void)());
    expect(screen.getByText("Chapter 2 of 3")).toBeInTheDocument();
  });
});

describe("the list of audiobooks", () => {
  it("lists each book once, and invites the first one when there are none", async () => {
    fakeServer({
      "GET /api/audiobooks": {
        audiobooks: [
          {
            id: "b1",
            kind: "book",
            title: "Art of War",
            author: "Sun Tzu",
            readers: ["Moira Fogarty"],
            chapterCount: 7,
            totalSeconds: 4334,
            sizeBytes: 35_000_000,
            addedAt: 1,
            url: "/library/collections/b1",
          },
        ],
      },
    });
    renderScreen(<AudiobookList q="" sort="added" />);
    const row = await screen.findByRole("link", { name: /Art of War/ });
    expect(row).toHaveAttribute("href", "/library/collections/b1");
    expect(within(row).getByText("By Sun Tzu, read by Moira Fogarty")).toBeInTheDocument();
    expect(within(row).getByText(/7 chapters, 1 hour 12 minutes/)).toBeInTheDocument();
  });

  it("shows an empty state that leads to the LibriVox shelf", async () => {
    fakeServer({ "GET /api/audiobooks": { audiobooks: [] } });
    renderScreen(<AudiobookList q="" sort="added" />);
    expect(await screen.findByText("No audiobooks yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "public-domain audiobooks from LibriVox" })).toHaveAttribute(
      "href",
      "/explore?category=audiobooks",
    );
  });

  it("says when it could not be loaded", async () => {
    fakeServer({ "GET /api/audiobooks": { status: 500, error: { code: "internal", message: "Broken." } } });
    renderScreen(<AudiobookList q="" sort="added" />);
    expect(await screen.findByText("This could not be loaded")).toBeInTheDocument();
  });
});

describe("the LibriVox shelf", () => {
  const shelf: LibrivoxShelfResponse = {
    checked: "2026-11-17",
    licence: "Public domain in the United States",
    licenceNote: "LibriVox: …",
    books: [
      {
        id: "119",
        shelf: "adults",
        title: "Art of War",
        authors: ["Sun Tzu"],
        readers: ["Moira Fogarty"],
        language: "English",
        totalSeconds: 4334,
        sections: 7,
        textYear: "1910",
        summary: "Strategy.",
        pageUrl: "https://librivox.org/the-art-of-war-by-sun-tzu/",
        zipUrl: "https://archive.org/compress/art_of_war_librivox/formats=64KBPS MP3&file=/art_of_war_librivox.zip",
        zipName: "art_of_war_librivox.zip",
        approxBytes: 4334 * 8000,
        inLibrary: null,
      },
    ],
  };

  it("states the running time, size, reader and licence, and links out rather than fetching", async () => {
    fakeServer({ "GET /api/audiobooks/librivox": shelf });
    renderScreen(<LibrivoxShelf />);
    expect(await screen.findByRole("heading", { name: "Art of War" })).toBeInTheDocument();
    expect(screen.getByText("Sun Tzu, read by Moira Fogarty")).toBeInTheDocument();
    expect(screen.getByText(/1 hour 12 minutes, 7 files, about 34\.7 MB/)).toBeInTheDocument();
    expect(screen.getByText("Public domain in the United States; elsewhere it depends on the country.")).toBeInTheDocument();
    expect(screen.getByText(/Outpost does not download these itself/)).toBeInTheDocument();
    const download = screen.getByRole("link", { name: /Download the zip/ });
    expect(download).toHaveAttribute("href", shelf.books[0]!.zipUrl);
    expect(download).toHaveAttribute("target", "_blank");

    await userEvent.click(screen.getByRole("button", { name: /Add the downloaded zip/ }));
    expect(await screen.findByRole("dialog", { name: "Add “Art of War”" })).toBeInTheDocument();
    expect(screen.getByText(/art_of_war_librivox\.zip/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add audiobook" })).toBeDisabled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  });

  it("leads to a book already held", async () => {
    fakeServer({
      "GET /api/audiobooks/librivox": {
        ...shelf,
        books: [{ ...shelf.books[0]!, inLibrary: { id: "b1", url: "/library/collections/b1" } }],
      },
    });
    renderScreen(<LibrivoxShelf />);
    expect(await screen.findByRole("link", { name: /In your library: listen/ })).toHaveAttribute("href", "/library/collections/b1");
    expect(screen.queryByRole("link", { name: /Download the zip/ })).toBeNull();
  });
});
