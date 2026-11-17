import fs from "node:fs";
import path from "node:path";
import { act, render } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorAnnouncer, notify } from "./notify";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(() => "t1") }) }));

const region = (container: HTMLElement) => container.querySelector("[aria-live='assertive']")!;

describe("notify.error", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(toast.error).mockClear();
  });

  it("shows the toast and says the message at once, in an assertive live region", () => {
    const { container } = render(<ErrorAnnouncer />);
    expect(region(container)).toHaveAttribute("aria-atomic", "true");
    let id: string | number = "";
    act(() => {
      id = notify.error("The plan could not be saved.", { description: "The server is not responding." });
    });
    expect(id).toBe("t1");
    expect(toast.error).toHaveBeenCalledWith("The plan could not be saved.", { description: "The server is not responding." });
    expect(region(container)).toHaveTextContent("The plan could not be saved. The server is not responding.");
  });

  it("says the same failure again when it happens again, and empties the region afterwards", () => {
    const { container } = render(<ErrorAnnouncer />);
    act(() => void notify.error("Not saved."));
    const first = region(container).firstElementChild;
    act(() => void notify.error("Not saved."));
    expect(region(container).firstElementChild).not.toBe(first);
    expect(region(container).children).toHaveLength(1);
    act(() => vi.advanceTimersByTime(7000));
    expect(region(container)).toBeEmptyDOMElement();
  });

  it("still shows the toast where no region is mounted", () => {
    notify.error("Not saved.");
    expect(toast.error).toHaveBeenCalledWith("Not saved.");
  });
});

describe("error toasts", () => {
  it("are raised through notify.error everywhere, so each is said at once", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const sources = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(file);
        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
      });
    const found = sources(root)
      .filter((file) => !file.endsWith(path.join("lib", "notify.tsx")))
      .filter((file) => /\btoast\.error\s*\(/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(found).toEqual([]);
  });
});
