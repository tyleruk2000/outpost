/**
 * The three things offered for a PDF Outpost made, in each state "Add to library" can
 * be in: on its way, added, already there, no room, storage away, stopped, no answer.
 */
import type { DocumentDto, UploadResponse } from "@outpost/shared";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { MadeInOutpostLine } from "./made-in-outpost";
import {
  addMadePdf,
  chooseMadeCategory,
  isInsidePath,
  MADE_CATEGORY,
  type MadePdf,
  madeCategory,
  madePdf,
  madeSource,
  parseMadeSource,
  type SendUpload,
} from "./made-pdf";
import { PdfActions } from "./pdf-actions";

const bytes = new TextEncoder().encode("%PDF-1.6 a prediction");
const prediction = (): MadePdf =>
  madePdf(bytes, "HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026", "HF prediction", {
    what: "the HF propagation planner",
    path: "/radio/propagation",
  });

const doc = (change: Partial<DocumentDto> = {}) =>
  ({
    id: "d1",
    title: "HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026",
    category: MADE_CATEGORY,
    createdAt: Date.UTC(2026, 10, 16, 9),
    ...change,
  }) as DocumentDto;

/** An upload that waits to be told how it ends, and reports the progress it is given. */
function heldUpload() {
  const calls: Array<{ path: string; form: FormData; signal?: AbortSignal; progress: (fraction: number) => void }> = [];
  let settle: { resolve: (value: UploadResponse) => void; reject: (error: unknown) => void } | undefined;
  const send = ((path: string, form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal) => {
    calls.push({ path, form, signal, progress: onProgress });
    return new Promise((resolve, reject) => {
      settle = { resolve: resolve as (value: UploadResponse) => void, reject };
      signal?.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
    });
  }) as SendUpload;
  return {
    send,
    calls,
    answer: (response: UploadResponse) => act(async () => settle?.resolve(response)),
    fail: (error: unknown) => act(async () => settle?.reject(error)),
  };
}

function show(pdf: MadePdf | null, send: SendUpload, extra: Partial<Parameters<typeof PdfActions>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PdfActions pdf={pdf} send={send} {...extra} />
    </MemoryRouter>,
  );
}

const status = () => screen.getByTestId("pdf-status");
const add = () => userEvent.click(screen.getByRole("button", { name: "Add to library" }));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:made-pdf");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("what is offered", () => {
  it("offers to save and to add to the library, and to share only where the device can", () => {
    const { unmount } = show(prediction(), heldUpload().send);
    const save = screen.getByRole("link", { name: "Save as PDF" });
    expect(save).toHaveAttribute("download", "hf-prediction-london-to-edinburgh-20-m-for-16-nov-2026.pdf");
    expect(save).toHaveAttribute("href", "blob:made-pdf");
    expect(screen.getByRole("button", { name: "Add to library" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    // What each one does, said where the choice is made: the saved file is not kept by Outpost; the library's copy is.
    expect(status()).toHaveTextContent(
      "“Save as PDF” puts hf-prediction-london-to-edinburgh-20-m-for-16-nov-2026.pdf on this device, where the browser keeps downloads. Outpost keeps no copy.",
    );
    expect(status()).toHaveTextContent(
      "“Add to library” files it under “Made in Outpost”: Outpost keeps it, where search and backups reach it.",
    );
    expect(status()).not.toHaveTextContent("“Share”");
    unmount();

    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { canShare: () => true, share }));
    const pdf = prediction();
    show(pdf, heldUpload().send);
    expect(status()).toHaveTextContent("“Share” hands it to another app on this device, such as mail or messages.");
    screen.getByRole("button", { name: "Share" }).click();
    expect(share).toHaveBeenCalledWith({ files: [pdf.file], title: pdf.title });
  });

  it("offers nothing to press until there is a file", () => {
    show(null, heldUpload().send);
    expect(screen.getByRole("button", { name: "Save as PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to library" })).toBeDisabled();
    expect(screen.queryByTestId("pdf-status")).not.toBeInTheDocument();
  });

  it("leads with the library where Outpost was opened from a phone's Home Screen", () => {
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { standalone: true }));
    show(prediction(), heldUpload().send);
    expect(screen.getByRole("button", { name: "Add to library" }).className).toContain("bg-primary");
    expect(screen.getByRole("link", { name: "Save as PDF" }).className).not.toContain("bg-primary ");
  });
});

describe("adding to the library", () => {
  it("sends the same bytes through the library's own upload, with what the file is and where it came from", async () => {
    const upload = heldUpload();
    const pdf = prediction();
    show(pdf, upload.send);
    await add();
    expect(upload.calls).toHaveLength(1);
    const { path, form } = upload.calls[0]!;
    expect(path).toBe("/api/documents");
    const sent = form.get("file") as File;
    expect(sent).toMatchObject({ name: pdf.file.name, size: bytes.length, type: "application/pdf" });
    expect(await sent.text()).toBe("%PDF-1.6 a prediction");
    expect(form.get("title")).toBe("HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026");
    expect(form.get("source")).toBe("Made in Outpost from the HF propagation planner: /radio/propagation");
    expect(form.get("category")).toBe("Made in Outpost");
    expect(form.get("tags")).toBe("HF prediction");
    // The words about the file are sent before its bytes.
    expect([...form.keys()].at(-1)).toBe("file");
  });

  it("shows real progress while it is on its way, then that the library is filing it", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    expect(status()).toHaveAttribute("data-state", "adding");
    expect(screen.getByRole("button", { name: "Add to library" })).toHaveAttribute("aria-disabled", "true");
    act(() => upload.calls[0]!.progress(0.43));
    expect(screen.getByRole("progressbar", { name: "Sending the PDF to the library" })).toHaveAttribute("aria-valuenow", "43");
    expect(status()).toHaveTextContent("Sending 21 bytes to the library: 43%.");
    act(() => upload.calls[0]!.progress(1));
    expect(status()).toHaveTextContent("The library is checking and filing it.");
    expect(screen.getByRole("progressbar", { name: "Sending the PDF to the library" })).not.toHaveAttribute("aria-valuenow");
  });

  it("says where it went, with a link that opens it", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await upload.answer({ results: [{ originalName: "x.pdf", status: "created", document: doc() }] });
    expect(status()).toHaveAttribute("data-state", "added");
    expect(status()).toHaveTextContent(
      "Added to the library under “Made in Outpost” as HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026.",
    );
    expect(within(status()).getByRole("link", { name: /^HF prediction, London to Edinburgh/ })).toHaveAttribute(
      "href",
      "/library/documents/d1",
    );
    expect(screen.getByRole("button", { name: "Add to library" })).toBeEnabled();
  });

  it("offers the document the library already has when the same PDF is added again", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await upload.answer({
      results: [{ originalName: "x.pdf", status: "duplicate", document: doc({ id: "d0", title: "The one added before" }) }],
    });
    expect(status()).toHaveAttribute("data-state", "duplicate");
    expect(status()).toHaveTextContent("Already in the library as The one added before, added on 16 Nov 2026. Nothing was added again.");
    expect(within(status()).getByRole("link", { name: "The one added before" })).toHaveAttribute("href", "/library/documents/d0");
    // It is never sent a second time with an instruction to keep both.
    expect(upload.calls).toHaveLength(1);
    expect(upload.calls[0]!.form.has("allowDuplicate")).toBe(false);
  });

  it("says when there is no room, how large the PDF is, and where to make room", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await upload.fail(new ApiError(507, "insufficient_space", '"Library share" does not have enough free space for this.'));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Not added: there is no room for it");
    expect(alert).toHaveTextContent('"Library share" does not have enough free space for this. The PDF is 21 bytes.');
    expect(within(alert).getByRole("link", { name: "Storage" })).toHaveAttribute("href", "/storage");
    expect(alert).toHaveTextContent("“Save as PDF” keeps it on this device meanwhile.");
    // The file is still here to save or to try again with.
    expect(screen.getByRole("link", { name: "Save as PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to library" })).toBeEnabled();
  });

  it("says when the storage location is away", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await upload.fail(
      new ApiError(
        503,
        "storage_unavailable",
        '"Library share" is not connected. Reconnect it or choose another storage location, then try again.',
      ),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Not added: the library's storage is not connected");
    expect(alert).toHaveTextContent('"Library share" is not connected.');
    expect(within(alert).getByRole("link", { name: "Storage" })).toHaveAttribute("href", "/storage");
  });

  it("says so when one file of the answer was refused for want of room", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await upload.answer({
      results: [{ originalName: "x.pdf", status: "rejected", code: "insufficient_space", reason: "The disk filled up." }],
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Not added: there is no room for it");
    expect(screen.getByRole("alert")).toHaveTextContent("The disk filled up.");
  });

  it("stops when told to, adds nothing, and can be tried again", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(upload.calls[0]!.signal?.aborted).toBe(true);
    expect(status()).toHaveAttribute("data-state", "cancelled");
    expect(status()).toHaveTextContent("Stopped. Nothing was added to the library.");
    await add();
    expect(upload.calls).toHaveLength(2);
    await upload.answer({ results: [{ originalName: "x.pdf", status: "created", document: doc() }] });
    expect(status()).toHaveAttribute("data-state", "added");
  });

  it("says when the server did not answer, and why a file was refused", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send);
    await add();
    await upload.fail(new ApiError(0, "unreachable", "The upload was interrupted. Check that the server is running."));
    expect(screen.getByRole("alert")).toHaveTextContent("Not added: Outpost did not answer");
    expect(screen.getByRole("alert")).toHaveTextContent("The PDF is still here: press “Add to library” to try again.");
    await add();
    await upload.fail(new ApiError(413, "too_large", "This file is larger than the 2 GB the library takes."));
    expect(screen.getByRole("alert")).toHaveTextContent("Not added");
    expect(screen.getByRole("alert")).toHaveTextContent("This file is larger than the 2 GB the library takes.");
  });

  it("starts afresh when the PDF is made again, and what is said of the old one is taken down", async () => {
    const upload = heldUpload();
    const { rerender } = show(prediction(), upload.send);
    await add();
    await upload.answer({ results: [{ originalName: "x.pdf", status: "created", document: doc() }] });
    expect(status()).toHaveAttribute("data-state", "added");
    rerender(
      <MemoryRouter>
        <PdfActions pdf={prediction()} send={upload.send} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(status()).toHaveAttribute("data-state", "idle"));
  });

  it("asks first where the screen says the PDF calls for it", async () => {
    const upload = heldUpload();
    show(prediction(), upload.send, {
      confirm: { title: "Add the emergency sheet to the library?", description: "It holds other people's details." },
    });
    await add();
    expect(upload.calls).toHaveLength(0);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("It holds other people's details.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add to library" }));
    expect(upload.calls).toHaveLength(1);
  });
});

describe("where it goes", () => {
  it("files under a category of the person's choosing, remembered on this device", async () => {
    const upload = heldUpload();
    const { unmount } = show(prediction(), upload.send);
    await userEvent.click(screen.getByRole("button", { name: "Change where" }));
    const field = screen.getByRole("textbox", { name: "Category for PDFs made in Outpost" });
    await userEvent.clear(field);
    await userEvent.type(field, "Radio paperwork");
    await userEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(status()).toHaveTextContent("files it under “Radio paperwork”");
    await add();
    expect(upload.calls[0]!.form.get("category")).toBe("Radio paperwork");
    await upload.answer({ results: [{ originalName: "x.pdf", status: "created", document: doc({ category: "Radio paperwork" }) }] });
    expect(status()).toHaveTextContent("Added to the library under “Radio paperwork”");
    unmount();

    // Next time, and on another screen, it is not asked again.
    expect(madeCategory()).toBe("Radio paperwork");
    show(prediction(), upload.send);
    expect(status()).toHaveTextContent("files it under “Radio paperwork”");
    // Emptied, it goes back to the usual one.
    expect(chooseMadeCategory("  ")).toBe(MADE_CATEGORY);
    expect(madeCategory()).toBe(MADE_CATEGORY);
  });
});

describe("what the source says, and the way back", () => {
  it("writes where the file was made from, and reads it back", () => {
    expect(madeSource({ what: "the communication plan “Family net”", path: "/radio/plans/p1" })).toBe(
      "Made in Outpost from the communication plan “Family net”: /radio/plans/p1",
    );
    expect(parseMadeSource("Made in Outpost from the communication plan “Family net”: /radio/plans/p1")).toEqual({
      what: "the communication plan “Family net”",
      path: "/radio/plans/p1",
    });
    expect(parseMadeSource("Made in Outpost from the map: /maps?lat=54.5270&lon=-3.0170&z=11.2")).toEqual({
      what: "the map",
      path: "/maps?lat=54.5270&lon=-3.0170&z=11.2",
    });
    expect(madeSource({ what: "the contacts screen" })).toBe("Made in Outpost from the contacts screen");
    expect(parseMadeSource("Made in Outpost from the contacts screen")).toEqual({ what: "the contacts screen" });
    expect(parseMadeSource("A book I scanned")).toBeNull();
    expect(parseMadeSource(null)).toBeNull();
  });

  it("follows only an address inside Outpost, since anyone may type in the source field", () => {
    for (const path of [
      "//evil.example/x",
      "/\\evil.example",
      "https://evil.example",
      "javascript:alert(1)",
      "/x:y",
      "/a b",
      "radio/plans",
    ]) {
      expect(isInsidePath(path), path).toBe(false);
      expect(parseMadeSource(`Made in Outpost from the map: ${path}`)?.path, path).toBeUndefined();
    }
    // An address that is not one inside Outpost is never written either.
    expect(madeSource({ what: "the map", path: "//evil.example" })).toBe("Made in Outpost from the map");

    const { rerender } = render(
      <MemoryRouter>
        <MadeInOutpostLine source="Made in Outpost from the communication plan “Family net”: /radio/plans/p1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Open the communication plan “Family net”" })).toHaveAttribute("href", "/radio/plans/p1");
    rerender(
      <MemoryRouter>
        <MadeInOutpostLine source="Made in Outpost from the map: //evil.example/x" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("the request, as it ends", () => {
  it("turns every way it can end into an outcome, and never throws", async () => {
    const pdf = prediction();
    const answering = (response: unknown) => (() => Promise.resolve(response)) as unknown as SendUpload;
    const failing = (error: unknown) => (() => Promise.reject(error)) as unknown as SendUpload;
    expect(
      await addMadePdf(pdf, { category: "X", send: answering({ results: [{ status: "created", document: doc({ category: "X" }) }] }) }),
    ).toMatchObject({
      status: "added",
      category: "X",
    });
    expect(await addMadePdf(pdf, { category: "X", send: answering({ results: [] }) })).toMatchObject({
      status: "failed",
      failure: "refused",
    });
    expect(await addMadePdf(pdf, { category: "X", send: answering(undefined) })).toMatchObject({ status: "failed", failure: "refused" });
    expect(await addMadePdf(pdf, { category: "X", send: failing(new DOMException("gone", "AbortError")) })).toEqual({
      status: "cancelled",
    });
    expect(await addMadePdf(pdf, { category: "X", send: failing(new Error("odd")) })).toEqual({
      status: "failed",
      failure: "refused",
      message: "odd",
    });
  });
});
