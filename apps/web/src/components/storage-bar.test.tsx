import type { StorageUsage } from "@outpost/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StorageBar, StorageKey } from "./storage-bar";

const GB = 1024 ** 3;
const location = { name: "Internal storage", totalBytes: 100 * GB, freeBytes: 40 * GB };
const usage = {
  totalBytes: 10 * GB,
  byKind: { map: { bytes: 8 * GB, count: 1 }, document: { bytes: 2 * GB, count: 3 } },
} as unknown as StorageUsage;

describe("a location's bar and its key", () => {
  it("names every part of the bar in words, not only in a hover title", () => {
    render(
      <>
        <StorageBar location={location} usage={usage} />
        <StorageKey location={location} usage={usage} />
      </>,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(/^Internal storage: .+ used of .+, .+ free$/);
    const key = screen.getByRole("list", { name: "What is on Internal storage" });
    expect(
      within(key)
        .getAllByRole("listitem")
        .map((item) => item.firstElementChild?.nextElementSibling?.textContent),
    ).toEqual(["Maps", "Documents", "Other files on this drive"]);
  });

  it("says nothing for a location whose size is not known", () => {
    const { container } = render(<StorageKey location={{ name: "Share", totalBytes: null, freeBytes: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
