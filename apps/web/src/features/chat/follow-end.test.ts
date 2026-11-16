import { describe, expect, it } from "vitest";
import { createEndFollower, type ScrollBox } from "./follow-end";

/** A scroller 500 pixels tall, as the browser keeps it: scrollTop never past the end. */
function box(contentHeight: number, clientHeight = 500): ScrollBox & { grow(by: number): void; resize(to: number): void } {
  let top = 0;
  let height = contentHeight;
  let client = clientHeight;
  const clamp = () => {
    top = Math.max(0, Math.min(top, height - client));
  };
  return {
    get scrollTop() {
      return top;
    },
    set scrollTop(value: number) {
      top = value;
      clamp();
    },
    get scrollHeight() {
      return height;
    },
    get clientHeight() {
      return client;
    },
    grow(by) {
      height += by;
    },
    resize(to) {
      client = to;
      clamp();
    },
  };
}

describe("following the end of a conversation", () => {
  it("keeps the end in view as it grows", () => {
    const follower = createEndFollower();
    const scroller = box(2_000);
    follower.toEnd(scroller);
    expect(scroller.scrollTop).toBe(1_500);
    scroller.grow(300);
    follower.follow(scroller);
    expect(scroller.scrollTop).toBe(1_800);
  });

  it("leaves someone who has scrolled up where they are, even before the scroll event comes", () => {
    const follower = createEndFollower();
    const scroller = box(2_000);
    follower.toEnd(scroller);
    // The person scrolls to the top, and a new piece is drawn before the browser says they scrolled.
    scroller.scrollTop = 0;
    scroller.grow(550);
    follower.follow(scroller);
    expect(scroller.scrollTop).toBe(0);
    expect(follower.pinned).toBe(false);
    // The event, when it comes, agrees.
    expect(follower.scrolled(scroller)).toBe(2_050);
    scroller.grow(100);
    follower.follow(scroller);
    expect(scroller.scrollTop).toBe(0);
  });

  it("follows again once they are back at the end, or ask for it", () => {
    const follower = createEndFollower();
    const scroller = box(2_000);
    follower.toEnd(scroller);
    scroller.scrollTop = 0;
    follower.scrolled(scroller);
    scroller.scrollTop = 1_480;
    follower.scrolled(scroller);
    scroller.grow(200);
    follower.follow(scroller);
    expect(scroller.scrollTop).toBe(1_700);

    scroller.scrollTop = 0;
    follower.scrolled(scroller);
    follower.pin();
    scroller.grow(200);
    follower.follow(scroller);
    expect(scroller.scrollTop).toBe(1_900);
  });

  it("still follows when the scroller gets taller and the browser moves the view up to fit", () => {
    const follower = createEndFollower();
    const scroller = box(2_000, 400);
    follower.toEnd(scroller);
    expect(scroller.scrollTop).toBe(1_600);
    // A phone's keyboard goes away: the scroller is taller, and its scrollTop is pulled back.
    scroller.resize(700);
    expect(scroller.scrollTop).toBe(1_300);
    scroller.grow(100);
    follower.follow(scroller);
    expect(scroller.scrollTop).toBe(1_400);
  });
});
