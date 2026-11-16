import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeyType } from "../prefs";
import { MousePaddleCapture } from "./mouse-paddle-capture";

function mouse(
  target: EventTarget,
  type: "mousedown" | "mouseup" | "mousemove" | "click" | "auxclick" | "dblclick" | "contextmenu",
  button: number,
  buttons = 0,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    buttons,
  });
  target.dispatchEvent(event);
  return event;
}

function setup({
  keyType = "paddle",
  swapPaddles = false,
  enabled = true,
}: {
  keyType?: KeyType;
  swapPaddles?: boolean;
  enabled?: boolean;
} = {}) {
  const onPress = vi.fn();
  const onRelease = vi.fn();
  const ordinaryClick = vi.fn();
  const view = render(
    <>
      <MousePaddleCapture keyType={keyType} swapPaddles={swapPaddles} enabled={enabled} onPress={onPress} onRelease={onRelease} />
      <button type="button" onClick={ordinaryClick}>
        Ordinary control
      </button>
    </>,
  );
  return { ...view, onPress, onRelease, ordinaryClick };
}

function startCapture(): void {
  fireEvent.click(screen.getByRole("button", { name: "Start mouse paddle" }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MousePaddleCapture", () => {
  it("is opt-in and leaves normal browsing untouched while off", () => {
    const { onPress, ordinaryClick } = setup();
    const ordinary = screen.getByRole("button", { name: "Ordinary control" });

    const down = mouse(ordinary, "mousedown", 0, 1);
    fireEvent.click(ordinary);

    expect(down.defaultPrevented).toBe(false);
    expect(onPress).not.toHaveBeenCalled();
    expect(ordinaryClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");
  });

  it("routes independent left and right edges and ignores duplicate/orphan transitions", () => {
    const { onPress, onRelease } = setup();
    startCapture();

    const leftDown = mouse(window, "mousedown", 0, 1);
    mouse(window, "mousedown", 0, 1); // OS/adapter repeat
    const rightDown = mouse(window, "mousedown", 2, 3); // squeeze
    mouse(window, "mouseup", 0, 2);
    mouse(window, "mouseup", 0, 2); // orphan release
    mouse(window, "mouseup", 2, 0);

    expect(leftDown.defaultPrevented).toBe(true);
    expect(rightDown.defaultPrevented).toBe(true);
    expect(onPress.mock.calls).toEqual([["dit"], ["dah"]]);
    expect(onRelease.mock.calls).toEqual([["dit"], ["dah"]]);
  });

  it("uses only the left button for a straight key and consumes the reserved right button", () => {
    const { onPress, onRelease } = setup({ keyType: "straight" });
    startCapture();

    mouse(window, "mousedown", 2, 2);
    mouse(window, "mouseup", 2, 0);
    mouse(window, "mousedown", 0, 1);
    mouse(window, "mouseup", 0, 0);

    expect(onPress.mock.calls).toEqual([["straight"]]);
    expect(onRelease.mock.calls).toEqual([["straight"]]);
    expect(screen.getByText(/Left click keys the straight contact/)).toBeInTheDocument();
  });

  it("shows the effective left/right mapping when paddle sides are swapped", () => {
    setup({ swapPaddles: true });
    expect(screen.getByText("Left click sends dah. Right click sends dit.")).toBeInTheDocument();
  });

  it.each(["click", "auxclick", "dblclick", "contextmenu"] as const)("suppresses generated %s events while active", (type) => {
    const { ordinaryClick } = setup();
    const ordinary = screen.getByRole("button", { name: "Ordinary control" });
    startCapture();

    const event = mouse(ordinary, type, type === "click" || type === "dblclick" ? 0 : 2);

    expect(event.defaultPrevented).toBe(true);
    expect(ordinaryClick).not.toHaveBeenCalled();
  });

  it("leaves the explicit Stop control operable and restores ordinary clicks", () => {
    const { ordinaryClick } = setup();
    startCapture();

    const stop = screen.getByRole("button", { name: "Stop mouse paddle" });
    expect(stop).not.toHaveAttribute("aria-pressed");
    fireEvent.click(stop);

    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");
    fireEvent.click(screen.getByRole("button", { name: "Ordinary control" }));
    expect(ordinaryClick).toHaveBeenCalledOnce();
  });

  it("releases a held paddle even when its mouseup lands over Stop", () => {
    const { onRelease } = setup();
    startCapture();
    mouse(window, "mousedown", 0, 1);

    const stop = screen.getByRole("button", { name: "Stop mouse paddle" });
    const up = mouse(stop, "mouseup", 0, 0);

    expect(up.defaultPrevented).toBe(true);
    expect(onRelease).toHaveBeenCalledWith("dit");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture active");
  });

  it("releases and disarms on Escape, blur and pagehide", () => {
    vi.useFakeTimers();
    const { onRelease } = setup();

    startCapture();
    mouse(window, "mousedown", 0, 1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onRelease).toHaveBeenLastCalledWith("dit");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");

    act(() => vi.runAllTimers());
    startCapture();
    mouse(window, "mousedown", 2, 2);
    fireEvent.blur(window);
    expect(onRelease).toHaveBeenLastCalledWith("dah");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");

    act(() => vi.runAllTimers());
    startCapture();
    mouse(window, "mousedown", 0, 1);
    fireEvent(window, new Event("pagehide"));
    expect(onRelease).toHaveBeenLastCalledWith("dit");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");
    expect(onRelease).toHaveBeenCalledTimes(3);
    act(() => vi.runAllTimers());
  });

  it("releases and disarms when the document becomes hidden", () => {
    vi.useFakeTimers();
    const descriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    const { onRelease } = setup();
    startCapture();
    mouse(window, "mousedown", 0, 1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));

    expect(onRelease).toHaveBeenCalledWith("dit");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");
    act(() => vi.runAllTimers());
    if (descriptor) Object.defineProperty(document, "visibilityState", descriptor);
    else Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("releases and disarms on key type changes and when disabled", () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const { rerender } = render(<MousePaddleCapture keyType="paddle" swapPaddles={false} onPress={onPress} onRelease={onRelease} />);
    startCapture();
    mouse(window, "mousedown", 0, 1);

    rerender(<MousePaddleCapture keyType="straight" swapPaddles={false} onPress={onPress} onRelease={onRelease} />);
    expect(onRelease).toHaveBeenLastCalledWith("dit");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle capture off");

    act(() => vi.runAllTimers());
    startCapture();
    mouse(window, "mousedown", 0, 1);
    rerender(<MousePaddleCapture keyType="straight" swapPaddles={false} enabled={false} onPress={onPress} onRelease={onRelease} />);
    expect(onRelease).toHaveBeenLastCalledWith("straight");
    expect(screen.getByRole("status")).toHaveTextContent("Mouse paddle unavailable");
    expect(screen.getByRole("button", { name: "Start mouse paddle" })).toBeDisabled();
    act(() => vi.runAllTimers());
  });

  it("releases held contacts on unmount", () => {
    vi.useFakeTimers();
    const { onRelease, unmount } = setup();
    startCapture();
    mouse(window, "mousedown", 0, 1);

    unmount();

    expect(onRelease).toHaveBeenCalledWith("dit");
    act(() => vi.runAllTimers());
  });

  it("drains a held button release and generated click after Escape", () => {
    vi.useFakeTimers();
    const { ordinaryClick } = setup();
    const ordinary = screen.getByRole("button", { name: "Ordinary control" });
    startCapture();
    mouse(window, "mousedown", 0, 1);

    fireEvent.keyDown(window, { key: "Escape" });
    const trailingUp = mouse(ordinary, "mouseup", 0, 0);
    const trailingClick = mouse(ordinary, "click", 0, 0);

    expect(trailingUp.defaultPrevented).toBe(true);
    expect(trailingClick.defaultPrevented).toBe(true);
    expect(ordinaryClick).not.toHaveBeenCalled();

    act(() => vi.runAllTimers());
    fireEvent.click(ordinary);
    expect(ordinaryClick).toHaveBeenCalledOnce();
  });

  it("ignores middle and extra mouse buttons", () => {
    const { onPress, onRelease } = setup();
    startCapture();

    const middleDown = mouse(window, "mousedown", 1, 4);
    mouse(window, "mouseup", 1, 0);
    const extraDown = mouse(window, "mousedown", 3, 8);
    mouse(window, "mouseup", 3, 0);

    expect(middleDown.defaultPrevented).toBe(false);
    expect(extraDown.defaultPrevented).toBe(false);
    expect(onPress).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });
});
