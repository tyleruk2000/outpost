import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintNotice } from "@/components/print-notice";
import { PRINT_WAIT_MS, printSupport, usePrinting } from "./printing";

/** A screen with a Print button, as the three that have one use it. */
function Screen() {
  const printing = usePrinting();
  return (
    <div>
      <p data-testid="lead">{printing.lead}</p>
      {printing.canPrint ? (
        <button type="button" onClick={printing.print}>
          Print
        </button>
      ) : null}
      <PrintNotice printing={printing} instead="Save the PDF and print that." />
    </div>
  );
}

const standalone = (value: boolean | undefined) => Object.defineProperty(navigator, "standalone", { value, configurable: true });

describe("asking the browser to print", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    standalone(undefined);
  });

  it("says nothing where the browser prints: the event before printing is the sign", () => {
    // What a desktop browser does: the event, then the dialogue.
    const print = vi.fn(() => void window.dispatchEvent(new Event("beforeprint")));
    vi.stubGlobal("print", print);
    render(<Screen />);
    expect(screen.getByTestId("lead")).toHaveTextContent("print");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Print" }).click());
    expect(print).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(PRINT_WAIT_MS + 100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("counts a sign that comes a moment after the call, as where a print sheet opens without stopping the page", () => {
    vi.stubGlobal("print", () => void setTimeout(() => window.dispatchEvent(new Event("beforeprint")), 400));
    render(<Screen />);
    act(() => screen.getByRole("button", { name: "Print" }).click());
    act(() => void vi.advanceTimersByTime(PRINT_WAIT_MS + 100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so, and what to do instead, when a press is followed by nothing", () => {
    // What a page inside an app's web view gets on an iPhone: the call returns and nothing happens.
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<Screen />);
    act(() => screen.getByRole("button", { name: "Print" }).click());
    expect(print).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(PRINT_WAIT_MS + 100));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("If no print dialogue opened, this browser does not print from a button");
    expect(notice).toHaveTextContent("Save the PDF and print that.");
    // A second press that does print takes the words away again.
    print.mockImplementation(() => void window.dispatchEvent(new Event("beforeprint")));
    act(() => screen.getByRole("button", { name: "Print" }).click());
    act(() => void vi.advanceTimersByTime(PRINT_WAIT_MS + 100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("treats a browser that throws as one that did not print", () => {
    vi.stubGlobal("print", () => {
      throw new Error("not here");
    });
    render(<Screen />);
    act(() => screen.getByRole("button", { name: "Print" }).click());
    act(() => void vi.advanceTimersByTime(PRINT_WAIT_MS + 100));
    expect(screen.getByRole("status")).toHaveTextContent("If no print dialogue opened");
  });

  it("offers no Print button where the browser has no print, and says what to do", () => {
    vi.stubGlobal("print", undefined);
    expect(printSupport()).toEqual({ canPrint: false, standalone: false });
    render(<Screen />);
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
    expect(screen.getByTestId("lead")).toHaveTextContent("other");
    expect(screen.getByRole("status")).toHaveTextContent("This browser cannot print from a page");
    expect(screen.getByRole("status")).toHaveTextContent("Save the PDF and print that.");
  });

  it("puts the other way first where the app was opened from the Home Screen, by either sign", () => {
    vi.stubGlobal("print", vi.fn());
    standalone(true);
    expect(printSupport()).toEqual({ canPrint: true, standalone: true });
    const first = render(<Screen />);
    expect(screen.getByTestId("lead")).toHaveTextContent("other");
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Opened from the Home Screen, a phone does not always print from a button");
    first.unmount();

    standalone(undefined);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    expect(printSupport().standalone).toBe(true);
    render(<Screen />);
    expect(screen.getByTestId("lead")).toHaveTextContent("other");
  });
});
