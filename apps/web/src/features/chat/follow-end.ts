/**
 * Keeping the end of a scrolling conversation in view while it grows, unless the person
 * has scrolled up to read.
 *
 * Whether they have is not left to the scroll event alone. That event comes with the next
 * frame, and on a busy device a new piece of a reply can be drawn before it: following the
 * end then took the person straight back down. So the view's lower edge is remembered each
 * time it is put at the end, and a view whose lower edge has since moved up has been
 * scrolled by the person, whatever the event has yet to say. (Content growing below does
 * not move that edge; a scroller made taller does not move it up.)
 */

/** The measurements of the scrolling element that matter here. */
export interface ScrollBox {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** Within this of the end counts as at the end. */
const NEAR_END = 72;

export interface EndFollower {
  /** True while the end is followed. */
  readonly pinned: boolean;
  /** Follow the end from now on (the person sent something, or asked for the newest words). */
  pin(): void;
  /** Puts the view at the end. */
  toEnd(box: ScrollBox): void;
  /** What has grown or been drawn: keeps the end in view if it is followed. */
  follow(box: ScrollBox): void;
  /** On a scroll event: follows the end again if the person has scrolled back to it. Returns how far from the end the view is. */
  scrolled(box: ScrollBox): number;
}

export function createEndFollower(): EndFollower {
  let pinned = true;
  /** The lower edge of the view when it was last put at the end; 0 when it has not been since `pin`. */
  let viewEnd = 0;
  return {
    get pinned() {
      return pinned;
    },
    pin() {
      pinned = true;
      viewEnd = 0;
    },
    toEnd(box) {
      box.scrollTop = box.scrollHeight;
      viewEnd = box.scrollTop + box.clientHeight;
    },
    follow(box) {
      if (box.scrollTop + box.clientHeight < viewEnd - 4) pinned = false;
      if (pinned) this.toEnd(box);
    },
    scrolled(box) {
      const fromEnd = box.scrollHeight - box.scrollTop - box.clientHeight;
      pinned = fromEnd < NEAR_END;
      if (pinned) viewEnd = box.scrollTop + box.clientHeight;
      return fromEnd;
    },
  };
}
