import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWidth } from "./use-width";

function Measured({ fallback }: { fallback?: number }) {
  const [ref, width] = useWidth(fallback);
  return (
    <div ref={ref} data-testid="box">
      {width}
    </div>
  );
}

let observed: Array<() => void> = [];
const original = window.ResizeObserver;

function stubSize(width: () => number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: width() }) as DOMRect);
  window.ResizeObserver = class {
    constructor(callback: () => void) {
      observed.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      observed = [];
    }
  } as unknown as typeof ResizeObserver;
}

describe("useWidth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.ResizeObserver = original;
    observed = [];
  });

  it("is the fallback until the element has a size", () => {
    stubSize(() => 0);
    render(<Measured fallback={640} />);
    expect(screen.getByTestId("box")).toHaveTextContent("640");
  });

  it("measures before the first paint, in whole pixels, and follows a resize", () => {
    let width = 389.6;
    stubSize(() => width);
    render(<Measured />);
    expect(screen.getByTestId("box")).toHaveTextContent("390");
    width = 1024.2;
    act(() => {
      for (const callback of observed) callback();
    });
    expect(screen.getByTestId("box")).toHaveTextContent("1024");
  });

  it("keeps the last width while the element has none (hidden)", () => {
    let width = 500;
    stubSize(() => width);
    render(<Measured />);
    width = 0;
    act(() => {
      for (const callback of observed) callback();
    });
    expect(screen.getByTestId("box")).toHaveTextContent("500");
  });

  it("stops observing when the component goes", () => {
    stubSize(() => 300);
    const { unmount } = render(<Measured />);
    expect(observed).toHaveLength(1);
    unmount();
    expect(observed).toHaveLength(0);
  });
});
