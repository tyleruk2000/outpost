/**
 * The paper aids opened to print: the sheet filling the screen, the browser's print,
 * the PDF, and what the screen does where the browser's print cannot be counted on.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRINT_WAIT_MS } from "@/lib/printing";
import { HandTab } from "./hand-tab";

/** The files the view has made and not yet let go of, by the address it gave each. */
const held = new Map<string, Blob>();
let made = 0;

beforeEach(() => {
  localStorage.clear();
  held.clear();
  made = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    made += 1;
    const address = `blob:outpost-test/${made}`;
    held.set(address, blob as Blob);
    return address;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((address) => void held.delete(address));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "standalone", { value: undefined, configurable: true });
});

/** The file behind the "Save as PDF" link, once it is made, read by pdf.js: its pages' sizes and words. */
async function savedPdf(): Promise<{ head: string; sizes: number[][]; items: string[] }> {
  const link = await screen.findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
  const blob = held.get(link.getAttribute("href")!);
  expect(blob, "the link points at a file the view still holds").toBeDefined();
  expect(blob!.type).toBe("application/pdf");
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob!);
  });
  const loading = getDocument({ data: bytes.slice() });
  const pdf = await loading.promise;
  const sizes: number[][] = [];
  const items: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const view = page.getViewport({ scale: 1 });
    sizes.push([Math.round(view.width * 100) / 100, Math.round(view.height * 100) / 100]);
    items.push(...((await page.getTextContent()).items as Array<{ str: string }>).map((item) => item.str).filter((str) => str.trim()));
  }
  await loading.destroy();
  return { head: String.fromCharCode(...bytes.slice(0, 5)), sizes, items };
}

async function choose(user: ReturnType<typeof userEvent.setup>, cipher: string) {
  await user.click(screen.getByRole("combobox", { name: "Cipher" }));
  await user.click(screen.getByRole("option", { name: cipher }));
}

async function openPads(user: ReturnType<typeof userEvent.setup>) {
  render(<HandTab />);
  await choose(user, "One-time pad");
  await user.click(screen.getByRole("button", { name: "Make pads" }));
  await user.click(screen.getByRole("button", { name: "Print pads" }));
  return screen.getByRole("dialog", { name: "One-time pads" });
}

/** The letters of each pad copy in a sheet on screen, by its heading. */
function lettersOnScreen(sheet: HTMLElement): Map<string, string> {
  const found = new Map<string, string>();
  for (const copy of sheet.querySelectorAll<HTMLElement>("[data-pad]")) {
    const heading = `One-time pad ${copy.dataset.pad}, copy ${copy.dataset.copy} of 2`;
    expect(copy).toHaveTextContent(heading);
    found.set(heading, [...copy.querySelectorAll("p.flex span:last-child")].map((line) => line.textContent!.replace(/ /g, "")).join(""));
  }
  return found;
}

/** The same from a PDF's words: the capitals that follow each heading (a reader joins a group's letters, with spaces between). */
function lettersInPdf(items: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  let heading: string | undefined;
  for (const words of items) {
    if (words.startsWith("One-time pad ")) {
      heading = words;
      found.set(heading, "");
    } else if (heading && /^[A-Z ]+$/.test(words)) found.set(heading, found.get(heading)! + words.replace(/ /g, ""));
    else if (words.startsWith("Use each letter once")) heading = undefined;
  }
  return found;
}

describe("printing one-time pads", () => {
  it("opens the sheets over the whole screen, prints them from the browser, and closes", async () => {
    const print = vi.fn(() => void window.dispatchEvent(new Event("beforeprint")));
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    const view = await openPads(user);

    await within(view).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    // Pressing "Print pads" shows the sheets; it does not print by itself.
    expect(print).not.toHaveBeenCalled();
    // The view is a child of the body itself, which is what the print rules in encryption.css rely on.
    expect(view.parentElement).toBe(document.body);
    expect(view).toHaveClass("print-sheet");
    expect(view).toHaveTextContent("2 pads of 250 letters, two copies of each.");
    const paper = within(view).getByTestId("print-paper");
    expect(paper.querySelectorAll("[data-pad]")).toHaveLength(4);
    // What is on the paper is what was shown before it was opened.
    expect(lettersOnScreen(paper)).toEqual(lettersOnScreen(screen.getByTestId("pad-preview")));
    expect(within(paper).getAllByText(/Never use any part of this pad for a second message/)).toHaveLength(4);
    // Everything that is not paper is marked to be left off it.
    for (const name of ["Print", "Close"]) expect(within(view).getByRole("button", { name }).closest(".print-chrome")).not.toBeNull();
    // A pad can be added to the library, which everyone on the network can read: the screen says so, and the
    // button asks before anything is sent.
    expect(view).toHaveTextContent("a pad kept there is no longer known only to the two people holding the paper");
    await user.click(within(view).getByRole("button", { name: "Add to library" }));
    const question = screen.getByRole("alertdialog", { name: "Add these pads to the library?" });
    expect(question).toHaveTextContent("can be read and searched by everyone who can reach Outpost on this network");
    expect(question).toHaveTextContent("copied into every backup");
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(view).getByTestId("pdf-status")).toHaveAttribute("data-state", "idle");
    expect(paper.closest(".print-chrome")).toBeNull();

    // Print leads, with the PDF beside it.
    const ways = within(within(view).getByTestId("print-ways"));
    expect([...ways.getByRole("button", { name: "Print" }).parentElement!.children].map((node) => node.textContent?.trim())).toEqual([
      "Print",
      "Save as PDF",
      "Add to library",
      "Close",
    ]);
    await user.click(ways.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();

    await user.click(ways.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.querySelector(".print-sheet")).toBeNull();
    // The file is let go of with the view.
    expect(held.size).toBe(0);
    // The pads are still on the tab, to open again.
    expect(screen.getByTestId("pad-preview").querySelectorAll("[data-pad]")).toHaveLength(4);
  }, 20_000);

  it("saves the same sheets as a PDF made in the page, and says the file is a copy to destroy", async () => {
    vi.stubGlobal("print", vi.fn());
    const fetched = vi.fn(() => Promise.reject(new Error("no request should be made")));
    vi.stubGlobal("fetch", fetched);
    const user = userEvent.setup();
    const view = await openPads(user);

    const link = await within(view).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    expect(link).toHaveAttribute("download", "one-time-pads.pdf");
    expect(link.getAttribute("href")).toMatch(/^blob:/);
    const saved = await savedPdf();
    expect(saved.head).toBe("%PDF-");
    // Letter for letter what is on the screen, both copies of both pads.
    const onScreen = lettersOnScreen(within(view).getByTestId("print-paper"));
    expect(onScreen.size).toBe(4);
    for (const letters of onScreen.values()) expect(letters).toMatch(/^[A-Z]{250}$/);
    expect(lettersInPdf(saved.items)).toEqual(onScreen);

    const warning = within(view).getByText("A saved PDF is another copy of the pads").closest('[role="status"]')!;
    expect(warning).toHaveTextContent("made on this device and sent nowhere");
    expect(warning).toHaveTextContent("Outpost keeps nothing once this screen is left");
    expect(warning).toHaveTextContent(
      "delete it when it is printed, here and anywhere it was shared or backed up, as you would burn the paper",
    );

    // The paper is a choice, and the file is made again for it; the old one is let go.
    // A device set to American English starts on US Letter.
    expect(saved.sizes).toEqual([[612, 792]]);
    expect(within(view).getByTestId("pdf-summary")).toHaveTextContent("The PDF is 1 page of US Letter.");
    const before = link.getAttribute("href")!;
    await user.click(within(view).getByRole("radio", { name: "A4" }));
    expect(held.has(before)).toBe(false);
    await waitFor(() => expect(within(view).getByTestId("pdf-summary")).toHaveTextContent("The PDF is 1 page of A4."), { timeout: 10_000 });
    const a4 = await savedPdf();
    expect(a4.sizes).toEqual([[595.28, 841.89]]);
    expect(lettersInPdf(a4.items)).toEqual(onScreen);

    expect(fetched).not.toHaveBeenCalled();
    // Nothing of the pads is put in the browser's storage: only which paper was chosen.
    expect(Object.keys(localStorage)).toEqual(["outpost.encryption.paper"]);
    expect(localStorage.getItem("outpost.encryption.paper")).toBe('"a4"');
    expect(sessionStorage).toHaveLength(0);
  }, 20_000);

  it("leaves Print out and leads with the PDF where the browser has no print", async () => {
    vi.stubGlobal("print", undefined);
    const user = userEvent.setup();
    const view = await openPads(user);
    expect(within(view).queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
    await within(view).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    const ways = within(view).getByTestId("print-ways");
    expect([...ways.children].map((node) => node.textContent?.trim())).toEqual(["Save as PDF", "Add to library", "Close"]);
    const notice = within(view).getByText("This browser cannot print from a page").closest('[role="status"]')!;
    expect(notice).toHaveTextContent("Save the PDF and print that.");
    expect(notice).toHaveTextContent("The browser’s own Share menu, then Print, prints this sheet too.");
    // The sheet is there to be seen all the same.
    expect(within(view).getByTestId("print-paper").querySelectorAll("[data-pad]")).toHaveLength(4);
    expect(lettersInPdf((await savedPdf()).items).size).toBe(4);
  }, 20_000);

  it("leads with the PDF where the app was opened from the Home Screen, and still offers Print", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const user = userEvent.setup();
    const view = await openPads(user);
    await within(view).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    const ways = within(view).getByTestId("print-ways");
    expect([...ways.children].map((node) => node.textContent?.trim())).toEqual(["Save as PDF", "Print", "Add to library", "Close"]);
    expect(within(view).getByText("Opened from the Home Screen, a phone does not always print from a button")).toBeInTheDocument();
    await user.click(within(view).getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("says what to do when Print is pressed and the browser does nothing", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    const view = await openPads(user);
    expect(within(view).queryByText(/If no print dialogue opened/)).not.toBeInTheDocument();
    await within(view).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    vi.useFakeTimers();
    act(() => within(view).getByRole("button", { name: "Print" }).click());
    expect(print).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(PRINT_WAIT_MS + 100));
    const notice = within(view)
      .getByText("If no print dialogue opened, this browser does not print from a button")
      .closest('[role="status"]')!;
    expect(notice).toHaveTextContent("Save the PDF and print that.");
    expect(within(view).getByRole("link", { name: "Save as PDF" })).toBeInTheDocument();
  });
});

describe("printing a Vigenère square", () => {
  it("opens the square the same way, with a PDF and no warning about secrets", async () => {
    const print = vi.fn(() => void window.dispatchEvent(new Event("beforeprint")));
    vi.stubGlobal("print", print);
    const user = userEvent.setup();
    render(<HandTab />);
    await choose(user, "Vigenère");
    await user.type(screen.getByLabelText("Key"), "LEMON");
    await user.click(screen.getByRole("button", { name: "Print a Vigenère square" }));
    const view = screen.getByRole("dialog", { name: "Vigenère square" });
    expect(print).not.toHaveBeenCalled();
    expect(view.parentElement).toBe(document.body);
    const paper = within(view).getByTestId("print-paper");
    expect(paper.querySelector('[data-sheet="vigenere-square"]')).not.toBeNull();
    expect(paper.querySelectorAll("tbody tr")).toHaveLength(26);
    expect(within(view).queryByText(/another copy of the pads/)).not.toBeInTheDocument();
    // The square is no secret: it is offered to the library with no question and no warning.
    const link = await within(view).findByRole("link", { name: "Save as PDF" }, { timeout: 10_000 });
    expect(within(view).getByRole("button", { name: "Add to library" })).toBeEnabled();
    expect(within(view).queryByText(/no longer known only to the two people/)).not.toBeInTheDocument();
    expect(within(view).getByTestId("pdf-summary")).toHaveTextContent(
      "The PDF is 1 page of US Letter, made on this device and sent nowhere.",
    );

    expect(link).toHaveAttribute("download", "vigenere-square.pdf");
    const saved = await savedPdf();
    expect(saved.items).toContain("Vigenère square");
    expect(saved.sizes).toHaveLength(1);

    await user.click(within(view).getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(held.size).toBe(0);
  }, 20_000);
});
