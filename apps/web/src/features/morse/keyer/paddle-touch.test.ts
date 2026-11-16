import { describe, expect, it, vi } from "vitest";

import {
  MorsePaddleTouchTracker,
  type MorsePaddleTransition,
  type MorsePaddleTransitionHandler,
  normalizeMorsePaddleSide,
} from "./paddle-touch";

function recorder(mode: "single" | "paddle") {
  const transitions: MorsePaddleTransition[] = [];
  const onTransition = vi.fn<MorsePaddleTransitionHandler>((transition) => {
    transitions.push(transition);
  });
  return {
    tracker: new MorsePaddleTouchTracker(mode, onTransition),
    transitions,
    onTransition,
  };
}

describe("normalizeMorsePaddleSide", () => {
  it("accepts physical halves and normalized keyer elements", () => {
    expect(normalizeMorsePaddleSide("left")).toBe("dit");
    expect(normalizeMorsePaddleSide("dit")).toBe("dit");
    expect(normalizeMorsePaddleSide("right")).toBe("dah");
    expect(normalizeMorsePaddleSide("dah")).toBe("dah");
  });
});

describe("MorsePaddleTouchTracker in paddle mode", () => {
  it("allows simultaneous dit and dah contacts", () => {
    const { tracker, transitions } = recorder("paddle");

    tracker.start(1, "left");
    tracker.start(2, "right");

    expect(transitions).toEqual([
      { side: "dit", pressed: true },
      { side: "dah", pressed: true },
    ]);
    expect(tracker.activeSides).toEqual(["dit", "dah"]);
    expect(tracker.isPressed("dit")).toBe(true);
    expect(tracker.isPressed("dah")).toBe(true);
  });

  it("emits only aggregate zero-to-one and one-to-zero boundaries", () => {
    const { tracker, transitions } = recorder("paddle");

    tracker.start("first", "dit");
    tracker.start("second", "left");
    tracker.end("first");
    expect(transitions).toEqual([{ side: "dit", pressed: true }]);

    tracker.end("second");
    expect(transitions).toEqual([
      { side: "dit", pressed: true },
      { side: "dit", pressed: false },
    ]);
  });

  it("moves touches across halves without releasing a side another touch holds", () => {
    const { tracker, transitions } = recorder("paddle");

    tracker.start("a", "left");
    tracker.start("b", "left");
    tracker.move("a", "right");
    tracker.move("b", "dah");
    tracker.end("a");
    tracker.end("b");

    expect(transitions).toEqual([
      { side: "dit", pressed: true },
      { side: "dah", pressed: true },
      { side: "dit", pressed: false },
      { side: "dah", pressed: false },
    ]);
  });
});

describe("MorsePaddleTouchTracker in single-lever mode", () => {
  it("keeps contacts mutually exclusive and lets the newest held side win", () => {
    const { tracker, transitions } = recorder("single");

    tracker.start("old-dit", "left");
    tracker.start("dah", "right");
    tracker.start("new-dit", "dit");

    expect(transitions).toEqual([
      { side: "dit", pressed: true },
      { side: "dit", pressed: false },
      { side: "dah", pressed: true },
      { side: "dah", pressed: false },
      { side: "dit", pressed: true },
    ]);
    expect(tracker.activeSides).toEqual(["dit"]);

    tracker.end("new-dit");
    expect(transitions.slice(-2)).toEqual([
      { side: "dit", pressed: false },
      { side: "dah", pressed: true },
    ]);

    tracker.end("dah");
    expect(transitions.slice(-2)).toEqual([
      { side: "dah", pressed: false },
      { side: "dit", pressed: true },
    ]);

    tracker.end("old-dit");
    expect(transitions.at(-1)).toEqual({ side: "dit", pressed: false });
    expect(tracker.activeSides).toEqual([]);
  });

  it("releases the old side before pressing the new side when a touch crosses halves", () => {
    const { tracker, transitions } = recorder("single");

    tracker.start(7, "left");
    tracker.move(7, "right");
    tracker.move(7, "dah");
    tracker.end(7);

    expect(transitions).toEqual([
      { side: "dit", pressed: true },
      { side: "dit", pressed: false },
      { side: "dah", pressed: true },
      { side: "dah", pressed: false },
    ]);
  });
});

describe("MorsePaddleTouchTracker lifecycle", () => {
  it("treats an unknown move as a start and ignores an unknown end", () => {
    const { tracker, transitions, onTransition } = recorder("paddle");

    tracker.end("missing");
    expect(onTransition).not.toHaveBeenCalled();

    tracker.move("late", "right");
    tracker.end("missing");
    expect(transitions).toEqual([{ side: "dah", pressed: true }]);
  });

  it("cancel and releaseAll synchronously release every contact exactly once", () => {
    const { tracker, transitions } = recorder("paddle");

    tracker.start(1, "left");
    tracker.start(2, "left");
    tracker.start(3, "right");
    tracker.cancel();
    tracker.releaseAll();
    tracker.end(1);
    tracker.end(3);

    expect(transitions).toEqual([
      { side: "dit", pressed: true },
      { side: "dah", pressed: true },
      { side: "dit", pressed: false },
      { side: "dah", pressed: false },
    ]);
    expect(tracker.activeSides).toEqual([]);
  });

  it("synchronizes held contacts when the mode changes", () => {
    const { tracker, transitions } = recorder("paddle");

    tracker.start("dit", "left");
    tracker.start("dah", "right");
    tracker.setMode("single");
    tracker.setMode("single");
    expect(transitions.at(-1)).toEqual({ side: "dit", pressed: false });
    expect(tracker.activeSides).toEqual(["dah"]);

    tracker.setMode("paddle");
    expect(transitions.at(-1)).toEqual({ side: "dit", pressed: true });
    expect(tracker.activeSides).toEqual(["dit", "dah"]);
  });
});
