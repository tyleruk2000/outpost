/**
 * Opt-in mouse-button capture for USB Morse interfaces that enumerate as a
 * conventional two-button mouse. The browser cannot distinguish one of those
 * adapters from a person's mouse, so capture is deliberately session-only and
 * never arms itself when the page opens.
 *
 * Mouse events are used instead of Pointer Events here. `mousedown` fires for
 * every changed mouse button, while `pointerdown` only fires when the pointer
 * changes from no buttons to at least one button. That distinction is what
 * lets an iambic operator squeeze left and right at the same time.
 */
import { MousePointer2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import type { PressSide } from "../keyer/use-keyer";
import type { KeyType } from "../prefs";

type PaddleMouseButton = 0 | 2;

interface HeldButton {
  side: PressSide;
  /** Keep the release paired with the callback that accepted the down edge. */
  release: (side: PressSide) => void;
}

const CAPTURE = true;
const TRAILING_DRAIN_TIMEOUT_MS = 1_500;
const STOP_CONTROL_ATTRIBUTE = "data-morse-mouse-capture-stop";

function isPaddleButton(button: number): button is PaddleMouseButton {
  return button === 0 || button === 2;
}

function suppress(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function isStopControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${STOP_CONTROL_ATTRIBUTE}="true"]`) !== null;
}

function sideForButton(button: PaddleMouseButton, keyType: KeyType): PressSide | null {
  if (keyType === "straight") return button === 0 ? "straight" : null;
  return button === 0 ? "dit" : "dah";
}

/**
 * A release can arrive after capture has stopped (Escape while a paddle is
 * held, a tab switch, blur, or unmount). Keep a tiny capture-phase guard alive
 * until those physical buttons come up, then through the browser's generated
 * click/context-menu event. Without this, that trailing edge could activate a
 * control on the newly revealed page.
 */
function drainTrailingMouseEdges(buttons: readonly PaddleMouseButton[]): void {
  if (typeof window === "undefined" || buttons.length === 0) return;

  const pending = new Set(buttons);
  let settleTimer: number | undefined;
  let stopped = false;

  const remove = (): void => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(settleTimer);
    window.clearTimeout(timeoutTimer);
    window.removeEventListener("mousedown", blockMouse, CAPTURE);
    window.removeEventListener("mouseup", onMouseUp, CAPTURE);
    window.removeEventListener("mousemove", onMouseMove, CAPTURE);
    window.removeEventListener("click", blockMouse, CAPTURE);
    window.removeEventListener("auxclick", blockMouse, CAPTURE);
    window.removeEventListener("dblclick", blockMouse, CAPTURE);
    window.removeEventListener("contextmenu", blockMouse, CAPTURE);
  };

  const settle = (): void => {
    if (pending.size !== 0 || settleTimer !== undefined) return;
    // `click`, `auxclick` and `contextmenu` are generated after mouseup. Leave
    // the guard through the end of this task so those cannot reach the UI.
    settleTimer = window.setTimeout(remove, 0);
  };

  function blockMouse(event: MouseEvent): void {
    if (isPaddleButton(event.button)) suppress(event);
  }

  function onMouseUp(event: MouseEvent): void {
    if (!isPaddleButton(event.button) || !pending.has(event.button)) return;
    suppress(event);
    pending.delete(event.button);
    settle();
  }

  function onMouseMove(event: MouseEvent): void {
    // A release outside the browser does not produce mouseup here. The first
    // move back into the page still reports the current button bitmask.
    if ((event.buttons & 1) === 0) pending.delete(0);
    if ((event.buttons & 2) === 0) pending.delete(2);
    settle();
  }

  window.addEventListener("mousedown", blockMouse, CAPTURE);
  window.addEventListener("mouseup", onMouseUp, CAPTURE);
  window.addEventListener("mousemove", onMouseMove, CAPTURE);
  window.addEventListener("click", blockMouse, CAPTURE);
  window.addEventListener("auxclick", blockMouse, CAPTURE);
  window.addEventListener("dblclick", blockMouse, CAPTURE);
  window.addEventListener("contextmenu", blockMouse, CAPTURE);
  const timeoutTimer = window.setTimeout(remove, TRAILING_DRAIN_TIMEOUT_MS);
}

export interface UseMousePaddleCaptureOptions {
  keyType: KeyType;
  enabled?: boolean;
  onPress: (side: PressSide) => void;
  onRelease: (side: PressSide) => void;
}

export interface MousePaddleCaptureController {
  capturing: boolean;
  start: () => void;
  stop: () => void;
}

/** Session-scoped controller used by the visual control below. */
export function useMousePaddleCapture({
  keyType,
  enabled = true,
  onPress,
  onRelease,
}: UseMousePaddleCaptureOptions): MousePaddleCaptureController {
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const keyTypeRef = useRef(keyType);
  const handlersRef = useRef({ onPress, onRelease });
  const heldRef = useRef(new Map<PaddleMouseButton, HeldButton>());
  handlersRef.current = { onPress, onRelease };
  keyTypeRef.current = keyType;

  const releaseHeld = useCallback((drain: boolean): void => {
    const held = heldRef.current;
    if (held.size === 0) return;
    const buttons = [...held.keys()];
    const entries = [...held.values()];
    held.clear();
    for (const entry of entries) entry.release(entry.side);
    if (drain) drainTrailingMouseEdges(buttons);
  }, []);

  const stop = useCallback((): void => {
    const wasCapturing = capturingRef.current;
    capturingRef.current = false;
    releaseHeld(true);
    if (wasCapturing) setCapturing(false);
  }, [releaseHeld]);

  const start = useCallback((): void => {
    if (!enabled || capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
  }, [enabled]);

  // Changing key mechanics while a contact is down would make its matching up
  // edge ambiguous. Release with the callback captured on press, then disarm.
  const previousMode = useRef(keyType);
  useLayoutEffect(() => {
    if (previousMode.current !== keyType) stop();
    previousMode.current = keyType;
  }, [keyType, stop]);

  useLayoutEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    if (!capturing) return;

    const onMouseDown = (event: MouseEvent): void => {
      if (!capturingRef.current || isStopControl(event.target) || !isPaddleButton(event.button)) {
        return;
      }
      suppress(event);
      const side = sideForButton(event.button, keyTypeRef.current);
      if (side === null || heldRef.current.has(event.button)) return;
      const handlers = handlersRef.current;
      heldRef.current.set(event.button, { side, release: handlers.onRelease });
      handlers.onPress(side);
    };

    const onMouseUp = (event: MouseEvent): void => {
      if (!capturingRef.current || !isPaddleButton(event.button)) return;
      const held = heldRef.current.get(event.button);
      // A normal click on Stop must reach the button. A paddle that went down
      // somewhere else still has to come up even if the pointer drifted over
      // Stop before release, otherwise the key can remain latched indefinitely.
      if (isStopControl(event.target) && !held) return;
      suppress(event);
      if (!held) return; // orphan up: consumed, never forwarded
      heldRef.current.delete(event.button);
      held.release(held.side);
    };

    const blockGeneratedClick = (event: MouseEvent): void => {
      if (capturingRef.current && !isStopControl(event.target) && isPaddleButton(event.button)) {
        suppress(event);
      }
    };

    const onEscape = (event: KeyboardEvent): void => {
      if (capturingRef.current && event.key === "Escape") {
        suppress(event);
        stop();
      }
    };
    const onLifecycleExit = (): void => stop();
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") stop();
    };

    window.addEventListener("mousedown", onMouseDown, CAPTURE);
    window.addEventListener("mouseup", onMouseUp, CAPTURE);
    window.addEventListener("click", blockGeneratedClick, CAPTURE);
    window.addEventListener("auxclick", blockGeneratedClick, CAPTURE);
    window.addEventListener("dblclick", blockGeneratedClick, CAPTURE);
    window.addEventListener("contextmenu", blockGeneratedClick, CAPTURE);
    window.addEventListener("keydown", onEscape, CAPTURE);
    window.addEventListener("blur", onLifecycleExit);
    window.addEventListener("pagehide", onLifecycleExit);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("mousedown", onMouseDown, CAPTURE);
      window.removeEventListener("mouseup", onMouseUp, CAPTURE);
      window.removeEventListener("click", blockGeneratedClick, CAPTURE);
      window.removeEventListener("auxclick", blockGeneratedClick, CAPTURE);
      window.removeEventListener("dblclick", blockGeneratedClick, CAPTURE);
      window.removeEventListener("contextmenu", blockGeneratedClick, CAPTURE);
      window.removeEventListener("keydown", onEscape, CAPTURE);
      window.removeEventListener("blur", onLifecycleExit);
      window.removeEventListener("pagehide", onLifecycleExit);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (capturingRef.current) {
        capturingRef.current = false;
        releaseHeld(true);
      }
    };
  }, [capturing, releaseHeld, stop]);

  return { capturing, start, stop };
}

export interface MousePaddleCaptureProps extends UseMousePaddleCaptureOptions {
  swapPaddles: boolean;
  className?: string;
  /** Slightly tighter rhythm for placement in a narrow QSO sidebar card. */
  compact?: boolean;
  /** Optional content placed after the standard safety guidance. */
  footer?: ReactNode;
}

function mappingCopy(keyType: KeyType, swapPaddles: boolean): string {
  if (keyType === "straight") {
    return "Left click keys the straight contact. Right click is reserved while capture is active.";
  }
  return swapPaddles ? "Left click sends dah. Right click sends dit." : "Left click sends dit. Right click sends dah.";
}

export function MousePaddleCapture({
  keyType,
  swapPaddles,
  enabled = true,
  onPress,
  onRelease,
  className,
  compact = false,
  footer,
}: MousePaddleCaptureProps) {
  const { capturing, start, stop } = useMousePaddleCapture({
    keyType,
    enabled,
    onPress,
    onRelease,
  });
  const hintId = useId();
  const status = !enabled ? "Mouse paddle unavailable" : capturing ? "Mouse paddle capture active" : "Mouse paddle capture off";

  return (
    <div className={cn(compact ? "space-y-1.5" : "space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={capturing ? "primary" : "secondary"}
          disabled={!enabled}
          // The label says Start or Stop, so no aria-pressed: a pressed "Stop" would say its state twice.
          aria-describedby={hintId}
          {...(capturing ? { [STOP_CONTROL_ATTRIBUTE]: "true" } : {})}
          onClick={capturing ? stop : start}
        >
          <MousePointer2 className="size-3.5" aria-hidden />
          {capturing ? "Stop mouse paddle" : "Start mouse paddle"}
        </Button>
        <span role="status" aria-live="polite" className={cn("text-small font-medium", capturing ? "text-success" : "text-ink-muted")}>
          {status}
        </span>
      </div>
      <div id={hintId} className={cn("text-small text-ink-muted", compact ? "space-y-0.5" : "space-y-1")}>
        <p>{mappingCopy(keyType, swapPaddles)}</p>
        <p>
          {capturing
            ? "Capture owns normal left and right clicks. Press Escape or use Stop mouse paddle to release it."
            : "Start capture only when an adapter is connected in mouse-button mode. Normal browsing is unchanged while capture is off."}
        </p>
        {footer}
      </div>
    </div>
  );
}
