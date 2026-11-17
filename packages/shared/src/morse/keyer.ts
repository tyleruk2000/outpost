/**
 * Keyer state machines — pure, clock-injected (no timers, no DOM).
 *
 * The caller feeds paddle transitions via `setPaddle(side, pressed, atMs)` and
 * pumps `tick(nowMs)` regularly (rAF / interval). Both return key-envelope
 * events `{ type: 'down' | 'up', at }` that drive the sidetone and decoder.
 * Timestamps are exact schedule times (not the jittery call times), so keying
 * is rhythm-perfect regardless of tick cadence.
 *
 * Semantics implemented (see keyerProfiles.ts):
 *  - alternation while both paddles are squeezed (iambic), or last-pressed
 *    repeats (ultimatic)
 *  - dit/dah memory: a tap of the opposite paddle during an element is latched
 *    and inserted at the next element boundary
 *  - Curtis A: releasing both paddles finishes the current element and stops
 *    (pending memory is cancelled on full release)
 *  - Curtis B: if the opposite paddle was seen down at any point during the
 *    current element, releasing both still sends one trailing opposite element
 */
import { DEFAULT_PROFILE, type KeyerProfile } from "./keyer-profiles.ts";

export type Element = "dit" | "dah";
export type PaddleSide = "dit" | "dah";

export interface KeyEvent {
  type: "down" | "up";
  at: number;
  /** the element this envelope belongs to (absent for straight-key events) */
  element?: Element;
}

const opposite = (e: Element): Element => (e === "dit" ? "dah" : "dit");

export interface KeyerTimings {
  ditMarkMs: number;
  dahMarkMs: number;
  spaceMs: number;
}

/** Element timings for a wpm + profile (weighting keeps the element rate constant). */
export function keyerTimings(wpm: number, profile: KeyerProfile): KeyerTimings {
  if (!Number.isFinite(wpm) || wpm <= 0) throw new Error("wpm must be > 0");
  const u = 1200 / wpm;
  const ditMarkMs = 2 * u * (profile.weightPct / 100);
  return {
    ditMarkMs,
    dahMarkMs: (profile.dahRatio - 1) * u + ditMarkMs,
    spaceMs: 2 * u - ditMarkMs,
  };
}

export class IambicKeyer {
  private profile: KeyerProfile;
  private t: KeyerTimings;
  private state: "idle" | "mark" | "space" = "idle";
  private element: Element = "dit";
  private stateEndsAt = 0;
  private paddles = { dit: false, dah: false };
  private lastPressed: PaddleSide = "dit";
  /** tap latch (dit/dah memory) */
  private memory: Element | null = null;
  /** mode B: opposite paddle observed down during the current element */
  private bLatch = false;

  constructor(wpm: number, profile: KeyerProfile = DEFAULT_PROFILE) {
    this.profile = profile;
    this.t = keyerTimings(wpm, profile);
  }

  setWpm(wpm: number): void {
    this.t = keyerTimings(wpm, this.profile);
  }

  setProfile(profile: KeyerProfile, wpm: number): void {
    this.profile = profile;
    this.t = keyerTimings(wpm, profile);
  }

  get isKeying(): boolean {
    return this.state !== "idle";
  }

  reset(): void {
    this.state = "idle";
    this.paddles = { dit: false, dah: false };
    this.memory = null;
    this.bLatch = false;
  }

  setPaddle(side: PaddleSide, pressed: boolean, at: number): KeyEvent[] {
    const events = this.tick(at);
    const was = this.paddles[side];
    this.paddles[side] = pressed;
    if (pressed && !was) {
      this.lastPressed = side;
      if (this.state === "idle") {
        events.push(...this.startElement(side, at));
      } else if (side === opposite(this.element)) {
        if (this.profile.ditDahMemory) this.memory = side;
        this.bLatch = true;
      }
    }
    if (!pressed && was && !this.paddles.dit && !this.paddles.dah) {
      // full release: Curtis A cancels anything pending
      if (this.profile.mode === "A") {
        this.memory = null;
        this.bLatch = false;
      }
    }
    return events;
  }

  tick(now: number): KeyEvent[] {
    const events: KeyEvent[] = [];
    // observe held opposite paddle for the B latch
    if (this.state !== "idle" && this.paddles[opposite(this.element)]) this.bLatch = true;
    while (this.state !== "idle" && now >= this.stateEndsAt) {
      const at = this.stateEndsAt;
      if (this.state === "mark") {
        events.push({ type: "up", at, element: this.element });
        this.state = "space";
        this.stateEndsAt = at + this.t.spaceMs;
      } else {
        const next = this.decideNext();
        if (next === null) {
          this.state = "idle";
        } else {
          events.push(...this.startElement(next, at));
        }
      }
    }
    return events;
  }

  private decideNext(): Element | null {
    if (this.memory !== null) {
      const m = this.memory;
      this.memory = null;
      return m;
    }
    const { dit, dah } = this.paddles;
    if (dit && dah) {
      return this.profile.mode === "ultimatic" ? this.lastPressed : opposite(this.element);
    }
    if (dit) return "dit";
    if (dah) return "dah";
    if (this.profile.mode === "B" && this.bLatch) return opposite(this.element);
    return null;
  }

  private startElement(el: Element, at: number): KeyEvent[] {
    this.element = el;
    this.state = "mark";
    this.stateEndsAt = at + (el === "dit" ? this.t.ditMarkMs : this.t.dahMarkMs);
    // squeeze tracking restarts per element; an already-held opposite counts
    this.bLatch = this.paddles[opposite(el)];
    return [{ type: "down", at, element: el }];
  }
}

/**
 * Semi-automatic "bug": dits repeat automatically while the dit paddle is
 * held; the dah side is a manual straight-key lever.
 */
export class BugKeyer {
  private t: KeyerTimings;
  private state: "idle" | "mark" | "space" | "manual" = "idle";
  private stateEndsAt = 0;
  private ditHeld = false;

  constructor(wpm: number, profile: KeyerProfile = DEFAULT_PROFILE) {
    this.t = keyerTimings(wpm, profile);
  }

  setWpm(wpm: number, profile: KeyerProfile = DEFAULT_PROFILE): void {
    this.t = keyerTimings(wpm, profile);
  }

  /** An automatic dit or the space after it is under way: tick() still has edges to give. */
  get isKeying(): boolean {
    return this.state === "mark" || this.state === "space";
  }

  setPaddle(side: PaddleSide, pressed: boolean, at: number): KeyEvent[] {
    const events = this.tick(at);
    if (side === "dit") {
      this.ditHeld = pressed;
      if (pressed && this.state === "idle") {
        this.state = "mark";
        this.stateEndsAt = at + this.t.ditMarkMs;
        events.push({ type: "down", at, element: "dit" });
      }
    } else {
      if (pressed && this.state === "idle") {
        this.state = "manual";
        events.push({ type: "down", at, element: "dah" });
      } else if (!pressed && this.state === "manual") {
        this.state = "idle";
        events.push({ type: "up", at, element: "dah" });
      }
    }
    return events;
  }

  tick(now: number): KeyEvent[] {
    const events: KeyEvent[] = [];
    while ((this.state === "mark" || this.state === "space") && now >= this.stateEndsAt) {
      const at = this.stateEndsAt;
      if (this.state === "mark") {
        events.push({ type: "up", at, element: "dit" });
        this.state = "space";
        this.stateEndsAt = at + this.t.spaceMs;
      } else if (this.ditHeld) {
        this.state = "mark";
        this.stateEndsAt = at + this.t.ditMarkMs;
        events.push({ type: "down", at, element: "dit" });
      } else {
        this.state = "idle";
      }
    }
    return events;
  }
}

/** Straight key — a passthrough that just timestamps the lever. */
export class StraightKey {
  private down = false;

  set(pressed: boolean, at: number): KeyEvent[] {
    if (pressed === this.down) return [];
    this.down = pressed;
    return [{ type: pressed ? "down" : "up", at }];
  }
}
