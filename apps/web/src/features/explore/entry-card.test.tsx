import type { CatalogEntryDto } from "@outpost/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, entry, renderScreen } from "../downloads/test-support";
import { EntryCard } from "./entry-card";

afterEach(() => vi.unstubAllGlobals());

function show(over: Partial<CatalogEntryDto>, options: { adding?: boolean; download?: ReturnType<typeof download> } = {}) {
  const onDownload = vi.fn();
  const onAdd = vi.fn();
  renderScreen(
    <ul>
      <EntryCard entry={entry(over)} download={options.download} adding={options.adding} onDownload={onDownload} onAdd={onAdd} />
    </ul>,
  );
  return Object.assign(onDownload, { onAdd });
}

/** A reference sheet that ships with Outpost. */
const sheet: Partial<CatalogEntryDto> = {
  id: "outpost.radio.uk-amateur-bands",
  name: "Amateur radio bands in the United Kingdom",
  publisher: "Outpost",
  category: "radio",
  format: "markdown",
  license: "MIT",
  source: { type: "bundled", file: "radio/uk-amateur-bands.md", version: "2026-11-15" },
  sizeBytes: 13_539,
  sizeIsEstimate: false,
  version: "2026-11-15",
  availability: "available",
};

describe("a catalogue entry", () => {
  it("shows what it is, an estimated size, and the unverified licence", () => {
    show({ license: "See source", licenseNote: "Not verified." });
    expect(screen.getByRole("heading", { name: "Knots by Wikipedia" })).toBeInTheDocument();
    expect(screen.getByText(/Wikipedia.*English/)).toBeInTheDocument();
    expect(screen.getByText("about 14.0 MB")).toBeInTheDocument();
    expect(screen.getByText("Licence: see the source. Not verified by the catalogue maintainers.")).toBeInTheDocument();
  });

  it("offers Download and hands the entry to the confirmation step", async () => {
    const onDownload = show({ sizeIsEstimate: false, sizeBytes: 14_100_000 });
    expect(screen.getByText("14.1 MB")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download Knots by Wikipedia" }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "kiwix.knots" }));
  });

  it("shows real progress with pause and cancel while downloading", () => {
    show({ status: "downloading", downloadId: "d1" }, { download: download() });
    expect(screen.getByText("412 MB of 1.90 GB")).toBeInTheDocument();
    expect(screen.getByText("2.10 MB/s, 4 minutes left")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", expect.stringMatching(/^21\./));
    expect(screen.getByRole("button", { name: "Pause Wikipedia 100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel Wikipedia 100" })).toBeInTheDocument();
  });

  it("offers resume when paused", () => {
    show({ status: "paused", downloadId: "d1" }, { download: download({ state: "paused", bytesPerSecond: null, etaSeconds: null }) });
    expect(screen.getByText("Paused at 412 MB of 1.90 GB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume Wikipedia 100" })).toBeInTheDocument();
  });

  it("gives the server's reason and Retry when the download failed", () => {
    show(
      { status: "failed", downloadId: "d1" },
      { download: download({ state: "failed", error: "“USB drive” is full. Free some space on it, then retry." }) },
    );
    expect(screen.getByText("“USB drive” is full. Free some space on it, then retry.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Wikipedia 100" })).toBeInTheDocument();
  });

  it("links an installed entry to its collection", () => {
    show({ status: "installed", collectionId: "c9" });
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Knots by Wikipedia" })).toHaveAttribute("href", "/library/collections/c9");
    expect(screen.queryByRole("button", { name: /Download|Update/ })).not.toBeInTheDocument();
  });

  it("offers Update beside Open when a newer version is listed", async () => {
    const onDownload = show({
      status: "installed",
      collectionId: "c9",
      installedVersion: "2026-06",
      version: "2026-09",
      updateAvailable: true,
      sizeIsEstimate: false,
    });
    expect(screen.getByText(/Version 2026-09 is available/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Knots by Wikipedia" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update Knots by Wikipedia" }));
    expect(onDownload).toHaveBeenCalled();
  });

  it("says when the source no longer offers it, with no download control", () => {
    show({ availability: "unavailable", unavailableReason: "The Kiwix library no longer lists this edition." });
    expect(screen.getByText("No longer offered at the source")).toBeInTheDocument();
    expect(screen.getByText("The Kiwix library no longer lists this edition.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says a sheet that ships with Outpost is included, and adds it with one press and no dialog", async () => {
    const onDownload = show(sheet);
    expect(screen.getByText("Included with Outpost")).toBeInTheDocument();
    expect(screen.getByText(/No download needed/)).toBeInTheDocument();
    expect(screen.getByText(/Outpost.*English.*Text document/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Download/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add to library: Amateur radio bands in the United Kingdom" }));
    expect(onDownload.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "outpost.radio.uk-amateur-bands" }));
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("shows the add as busy while the sheet is being copied", () => {
    show(sheet, { adding: true });
    expect(screen.getByRole("button", { name: "Add to library: Amateur radio bands in the United Kingdom" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("opens an added sheet as the document it became", () => {
    show({ ...sheet, status: "installed", collectionId: "c4", documentId: "d7", installedVersion: "2026-11-15" });
    expect(screen.getByText("In your library")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Amateur radio bands in the United Kingdom" })).toHaveAttribute(
      "href",
      "/library/documents/d7",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers the newer edition of a sheet that came with an update of Outpost", async () => {
    const onDownload = show({
      ...sheet,
      status: "installed",
      collectionId: "c4",
      documentId: "d7",
      installedVersion: "2026-11-15",
      version: "2027-02-01",
      updateAvailable: true,
    });
    expect(screen.getByText("Version 2027-02-01 came with this version of Outpost.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update Amateur radio bands in the United Kingdom" }));
    expect(onDownload.onAdd).toHaveBeenCalled();
    expect(onDownload).not.toHaveBeenCalled();
  });
});
