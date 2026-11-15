import type { DocumentDto } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { UploadItem } from "./upload-queue";
import { summariseUploads, UploadTray } from "./upload-tray";

const item = (id: string, name: string, change: Partial<UploadItem>): UploadItem => ({
  id,
  file: new File(["12345"], name),
  state: "queued",
  progress: 0,
  allowDuplicate: false,
  ...change,
});
const doc = (id: string, title: string) => ({ id, title }) as DocumentDto;

function renderTray(items: UploadItem[]) {
  const handlers = { onAddAnyway: vi.fn(), onRetry: vi.fn(), onCancel: vi.fn(), onDismiss: vi.fn() };
  render(
    <MemoryRouter>
      <UploadTray items={items} {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

describe("upload tray", () => {
  it("renders nothing when no files have been added", () => {
    renderTray([]);
    expect(screen.queryByRole("region", { name: "Files being added" })).not.toBeInTheDocument();
  });

  it("links a created file to its new document", () => {
    renderTray([item("1", "guide.pdf", { state: "created", progress: 1, document: doc("d1", "Water guide") })]);
    expect(screen.getByRole("link", { name: "Water guide" })).toHaveAttribute("href", "/library/documents/d1");
    expect(screen.getByText(/Added as/)).toBeInTheDocument();
  });

  it("says a duplicate is already in the library, links the existing document, and offers to add it anyway", async () => {
    const handlers = renderTray([item("7", "guide.pdf", { state: "duplicate", progress: 1, document: doc("d0", "Existing guide") })]);
    expect(screen.getByText(/Already in your library as/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Existing guide" })).toHaveAttribute("href", "/library/documents/d0");
    await userEvent.click(screen.getByRole("button", { name: "Add anyway" }));
    expect(handlers.onAddAnyway).toHaveBeenCalledWith("7");
  });

  it("shows the server's reason for a refused file word for word", () => {
    const reason = '"installer.exe" is a .exe file, which the library cannot store. Supported types: PDF, EPUB.';
    renderTray([item("1", "installer.exe", { state: "rejected", progress: 1, reason })]);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add anyway" })).not.toBeInTheDocument();
  });

  it("shows real progress while sending, and lets the file be cancelled", async () => {
    const handlers = renderTray([item("3", "big.pdf", { state: "uploading", progress: 0.42 })]);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Sending big.pdf" })).toHaveAttribute("aria-valuenow", "42");
    await userEvent.click(screen.getByRole("button", { name: "Cancel big.pdf" }));
    expect(handlers.onCancel).toHaveBeenCalledWith("3");
  });

  it("says the file is being checked once every byte has been sent", () => {
    renderTray([item("3", "big.pdf", { state: "uploading", progress: 1 })]);
    expect(screen.getByText("Checking the file")).toBeInTheDocument();
  });

  it("offers to try again after a failed request", async () => {
    const handlers = renderTray([
      item("4", "a.pdf", { state: "failed", reason: "The upload was interrupted. Check that the server is running." }),
    ]);
    expect(screen.getByText("The upload was interrupted. Check that the server is running.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(handlers.onRetry).toHaveBeenCalledWith("4");
  });

  it("can be dismissed only once everything has settled", async () => {
    const working = [
      item("1", "a.pdf", { state: "created", progress: 1, document: doc("d1", "A") }),
      item("2", "b.pdf", { state: "uploading", progress: 0.5 }),
    ];
    const first = renderTray(working);
    const tray = screen.getByRole("region", { name: "Files being added" });
    expect(within(tray).getByRole("status")).toHaveTextContent("Adding 2 files, 1 finished");
    expect(within(tray).queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(first.onDismiss).not.toHaveBeenCalled();
  });

  it("sums up what happened when it is done", async () => {
    const done = [
      item("1", "a.pdf", { state: "created" }),
      item("2", "b.pdf", { state: "created" }),
      item("3", "c.pdf", { state: "duplicate" }),
      item("4", "d.exe", { state: "rejected", reason: "No." }),
      item("5", "e.pdf", { state: "failed", reason: "No." }),
    ];
    expect(summariseUploads(done)).toBe("2 added, 1 already in your library, 2 not added");
    const handlers = renderTray(done);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(handlers.onDismiss).toHaveBeenCalled();
  });
});
