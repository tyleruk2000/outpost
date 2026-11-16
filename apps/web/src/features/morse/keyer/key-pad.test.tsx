/**
 * The on-screen paddles follow every finger by its pointer id: two thumbs make a squeeze,
 * a thumb sliding across moves to the other lever, and a lost finger lets go.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeyPad } from "./key-pad";

vi.mock("../audio/sidetone", () => ({ getSidetone: () => ({ unlock: vi.fn() }) }));

const bindings = { dit: "ControlLeft", dah: "ControlRight", straight: "Space" };

function setup(keyType: "paddle" | "single" | "straight" | "bug" = "paddle") {
  const onPress = vi.fn();
  const onRelease = vi.fn();
  render(<KeyPad keyType={keyType} keyDown={false} bindings={bindings} swapPaddles={false} onPress={onPress} onRelease={onRelease} />);
  return { onPress, onRelease };
}

function paddles() {
  const surface = screen.getByTestId("morse-paddles");
  surface.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 160,
    right: 200,
    bottom: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return surface;
}

const touch = (pointerId: number, clientX: number) => ({ pointerId, clientX, clientY: 80, pointerType: "touch", button: 0, buttons: 1 });

describe("the on-screen paddles", () => {
  it("hold both levers at once for a squeeze, each released by its own finger", () => {
    const { onPress, onRelease } = setup();
    const surface = paddles();
    fireEvent.pointerDown(surface, touch(1, 40));
    fireEvent.pointerDown(surface, touch(2, 160));
    expect(onPress.mock.calls).toEqual([["dit"], ["dah"]]);
    fireEvent.pointerUp(surface, touch(1, 40));
    expect(onRelease.mock.calls).toEqual([["dit"]]);
    fireEvent.pointerUp(surface, touch(2, 160));
    expect(onRelease.mock.calls).toEqual([["dit"], ["dah"]]);
  });

  it("move the contact when a thumb slides to the other lever, and let go when a finger is lost", () => {
    const { onPress, onRelease } = setup();
    const surface = paddles();
    fireEvent.pointerDown(surface, touch(1, 40));
    fireEvent.pointerMove(surface, touch(1, 150));
    expect(onRelease.mock.calls).toEqual([["dit"]]);
    expect(onPress.mock.calls).toEqual([["dit"], ["dah"]]);
    fireEvent.pointerCancel(surface, touch(1, 150));
    expect(onRelease.mock.calls).toEqual([["dit"], ["dah"]]);
  });

  it("let the newest finger win on a single lever, so both contacts are never closed together", () => {
    const { onPress, onRelease } = setup("single");
    const surface = paddles();
    fireEvent.pointerDown(surface, touch(1, 40));
    fireEvent.pointerDown(surface, touch(2, 160));
    expect(onRelease.mock.calls).toEqual([["dit"]]);
    expect(onPress.mock.calls).toEqual([["dit"], ["dah"]]);
    fireEvent.pointerUp(surface, touch(2, 160));
    // The older finger is still down: its lever comes back.
    expect(onPress.mock.calls.at(-1)).toEqual(["dit"]);
  });

  it("take no part in scrolling, selecting or the long-press menu", () => {
    setup();
    const surface = paddles();
    expect(surface.className).toContain("touch-none");
    expect(surface.className).toContain("select-none");
    expect(surface.className).toContain("[-webkit-touch-callout:none]");
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    surface.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it("key a straight key while any finger holds it", () => {
    const { onPress, onRelease } = setup("straight");
    const knob = screen.getByTestId("morse-straight-key");
    fireEvent.pointerDown(knob, touch(1, 10));
    fireEvent.pointerDown(knob, touch(2, 20));
    fireEvent.pointerUp(knob, touch(1, 10));
    expect(onPress.mock.calls).toEqual([["straight"]]);
    expect(onRelease).not.toHaveBeenCalled();
    fireEvent.pointerUp(knob, touch(2, 20));
    expect(onRelease.mock.calls).toEqual([["straight"]]);
  });
});
