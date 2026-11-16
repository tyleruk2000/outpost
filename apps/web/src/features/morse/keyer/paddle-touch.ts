export type MorsePaddleTouchMode = "single" | "paddle";

export type MorsePaddleSide = "dit" | "dah";

/**
 * Physical halves and already-normalized keyer elements are both accepted.
 * Callers that swap their paddles can pass `dah` for the left half and `dit`
 * for the right half; the physical aliases use the conventional arrangement.
 */
export type MorsePaddleRawSide = "left" | "right" | MorsePaddleSide;

export type MorsePaddleTouchId = string | number;

export interface MorsePaddleTransition {
  side: MorsePaddleSide;
  pressed: boolean;
}

export type MorsePaddleTransitionHandler = (transition: MorsePaddleTransition) => void;

interface TrackedTouch {
  side: MorsePaddleSide;
  order: number;
}

const SIDES: readonly MorsePaddleSide[] = ["dit", "dah"];

export function normalizeMorsePaddleSide(side: MorsePaddleRawSide): MorsePaddleSide {
  return side === "left" || side === "dit" ? "dit" : "dah";
}

/**
 * Turns touches on the on-screen paddles into key contacts opening and closing. Each
 * touch is tracked by its own id, so two thumbs can hold both paddles at once (an
 * iambic squeeze) and a thumb sliding from one paddle to the other moves the contact.
 * From LogBook73's phone app, where the paddles had multi-touch first.
 *
 * Each contact only emits at its effective 0 -> 1 or 1 -> 0 boundary. Paddle
 * mode permits a dit and dah contact at the same time. Single-lever mode keeps
 * all held touches so the newest side wins while it is held and an older side
 * can resume when that touch is released.
 */
export class MorsePaddleTouchTracker {
  private readonly touches = new Map<string, TrackedTouch>();
  private readonly active = new Set<MorsePaddleSide>();
  private sequence = 0;
  private currentMode: MorsePaddleTouchMode;

  private readonly onTransition?: MorsePaddleTransitionHandler;

  constructor(mode: MorsePaddleTouchMode, onTransition?: MorsePaddleTransitionHandler) {
    this.currentMode = mode;
    this.onTransition = onTransition;
  }

  get mode(): MorsePaddleTouchMode {
    return this.currentMode;
  }

  /** A stable snapshot ordered dit, then dah. */
  get activeSides(): readonly MorsePaddleSide[] {
    return SIDES.filter((side) => this.active.has(side));
  }

  isPressed(side: MorsePaddleSide): boolean {
    return this.active.has(side);
  }

  setMode(mode: MorsePaddleTouchMode): readonly MorsePaddleTransition[] {
    if (mode === this.currentMode) return [];
    this.currentMode = mode;
    return this.synchronizeContacts();
  }

  start(touchId: MorsePaddleTouchId, side: MorsePaddleRawSide): readonly MorsePaddleTransition[] {
    return this.updateTouch(touchId, side);
  }

  move(touchId: MorsePaddleTouchId, side: MorsePaddleRawSide): readonly MorsePaddleTransition[] {
    return this.updateTouch(touchId, side);
  }

  end(touchId: MorsePaddleTouchId): readonly MorsePaddleTransition[] {
    if (!this.touches.delete(String(touchId))) return [];
    return this.synchronizeContacts();
  }

  cancel(): readonly MorsePaddleTransition[] {
    return this.releaseAll();
  }

  releaseAll(): readonly MorsePaddleTransition[] {
    if (this.touches.size === 0 && this.active.size === 0) return [];
    this.touches.clear();
    return this.synchronizeContacts();
  }

  private updateTouch(touchId: MorsePaddleTouchId, rawSide: MorsePaddleRawSide): readonly MorsePaddleTransition[] {
    const id = String(touchId);
    const side = normalizeMorsePaddleSide(rawSide);
    const previous = this.touches.get(id);
    if (previous?.side === side) return [];

    this.sequence += 1;
    this.touches.set(id, { side, order: this.sequence });
    return this.synchronizeContacts();
  }

  private desiredContacts(): Set<MorsePaddleSide> {
    if (this.currentMode === "paddle") {
      return new Set(Array.from(this.touches.values(), (touch) => touch.side));
    }

    let newest: TrackedTouch | undefined;
    for (const touch of this.touches.values()) {
      if (!newest || touch.order > newest.order) newest = touch;
    }
    return newest ? new Set([newest.side]) : new Set();
  }

  private synchronizeContacts(): readonly MorsePaddleTransition[] {
    const desired = this.desiredContacts();
    const transitions: MorsePaddleTransition[] = [];

    const emit = (transition: MorsePaddleTransition): void => {
      transitions.push(transition);
      this.onTransition?.(transition);
    };

    // Release before pressing when a single lever changes direction. This
    // guarantees there is never a moment when both contacts appear closed.
    for (const side of SIDES) {
      if (this.active.has(side) && !desired.has(side)) {
        this.active.delete(side);
        emit({ side, pressed: false });
      }
    }

    for (const side of SIDES) {
      if (!this.active.has(side) && desired.has(side)) {
        this.active.add(side);
        emit({ side, pressed: true });
      }
    }

    return transitions;
  }
}
