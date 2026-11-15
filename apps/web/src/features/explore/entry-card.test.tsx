import type { CatalogEntryDto } from "@outpost/shared";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download, entry, renderScreen } from "../downloads/test-support";
import { EntryCard } from "./entry-card";

afterEach(() => vi.unstubAllGlobals());

function show(over: Partial<CatalogEntryDto>, options: { isAdmin?: boolean; download?: ReturnType<typeof download> } = {}) {
  const onDownload = vi.fn();
  renderScreen(
    <ul>
      <EntryCard entry={entry(over)} download={options.download} isAdmin={options.isAdmin ?? true} onDownload={onDownload} />
    </ul>,
  );
  return onDownload;
}

describe("a catalogue entry", () => {
  it("shows what it is, an estimated size, and the unverified licence", () => {
    show({ license: "See source", licenseNote: "Not verified." });
    expect(screen.getByRole("heading", { name: "Knots by Wikipedia" })).toBeInTheDocument();
    expect(screen.getByText(/Wikipedia.*English/)).toBeInTheDocument();
    expect(screen.getByText("about 14.0 MB")).toBeInTheDocument();
    expect(screen.getByText("Licence: see the source. Not verified by the catalogue maintainers.")).toBeInTheDocument();
  });

  it("offers Download to an administrator and hands the entry to the confirmation step", async () => {
    const onDownload = show({ sizeIsEstimate: false, sizeBytes: 14_100_000 });
    expect(screen.getByText("14.1 MB")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download Knots by Wikipedia" }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: "kiwix.knots" }));
  });

  it("lets a member browse without a download control", () => {
    show({}, { isAdmin: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows real progress with pause and cancel while downloading", () => {
    show({ status: "downloading", downloadId: "d1" }, { download: download() });
    expect(screen.getByText("412 MB of 1.90 GB")).toBeInTheDocument();
    expect(screen.getByText("2.10 MB/s, 4 minutes left")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", expect.stringMatching(/^21\./));
    expect(screen.getByRole("button", { name: "Pause Wikipedia 100" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel Wikipedia 100" })).toBeInTheDocument();
  });

  it("offers resume when paused, and nothing to a member", () => {
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
});
