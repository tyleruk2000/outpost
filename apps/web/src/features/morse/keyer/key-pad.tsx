/**
 * The on-screen key, made for thumbs. A straight key is one large round knob; a paddle,
 * a single lever and a bug are two levers side by side (on a bug the left one repeats
 * dits and the right one is a straight dah lever).
 *
 * The two levers are one surface that follows every finger on it by its pointer id,
 * as LogBook73's phone app does: two thumbs hold both levers at once for an iambic
 * squeeze, a thumb that slides across moves to the other lever, and lifting or losing
 * a finger (a call coming in) always lets its lever go. The surface takes no part in
 * scrolling, selecting text, zooming on a double tap or the long-press menu, so a held
 * key stays a held key. A tap's pointerup also resumes sound, which on an iPhone is
 * the event that is allowed to.
 */
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getSidetone } from "../audio/sidetone";
import { type KeyType, keyCodeLabel } from "../prefs";
import { MorsePaddleTouchTracker, type MorsePaddleTransition } from "./paddle-touch";
import type { PressSide } from "./use-keyer";

export interface KeyPadProps {
  keyType: KeyType;
  keyDown: boolean;
  bindings: { dit: string; dah: string; straight: string };
  swapPaddles: boolean;
  onPress: (side: PressSide) => void;
  onRelease: (side: PressSide) => void;
  /** False while the trainer is playing or it is the other station's turn: the key shows that it is not live. */
  live?: boolean;
  className?: string;
}

/** Keeps a held key from turning into a scroll, a selection, a zoom or a callout. */
const holdable = "touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none] [-webkit-tap-highlight-color:transparent]";

function Lamp({ keyDown }: { keyDown: boolean }) {
  return (
    <div className="flex items-center gap-2 text-small" role="status" aria-live="off">
      <span
        aria-hidden
        className={cn("size-3 rounded-full transition-colors duration-75", keyDown ? "bg-lamp" : "border border-border-strong bg-page")}
      />
      <span className={keyDown ? "font-medium text-ink" : "text-ink-muted"}>{keyDown ? "Key down" : "Key up"}</span>
    </div>
  );
}

function Lever({ side, label, keyLabel, held }: { side: "dit" | "dah"; label: string; keyLabel: string; held: boolean }) {
  return (
    <div
      data-side={side}
      aria-hidden
      className={cn(
        "flex min-h-40 min-w-0 flex-1 flex-col items-center justify-between rounded-panel border px-3 py-4 transition-[transform,background-color,border-color] duration-75",
        held ? "translate-y-1 border-primary bg-primary-soft" : "border-border-strong bg-page",
      )}
    >
      <span className="font-mono text-display leading-none text-ink">{label === "Dit" ? "·" : "−"}</span>
      <span className="text-body font-medium text-ink">{label}</span>
      <span className="rounded-control bg-surface-strong px-1.5 py-0.5 text-micro text-ink-muted">{keyLabel}</span>
    </div>
  );
}

export function KeyPad({ keyType, keyDown, bindings, swapPaddles, onPress, onRelease, live = true, className }: KeyPadProps) {
  const handlers = useRef({ onPress, onRelease });
  handlers.current = { onPress, onRelease };
  const [held, setHeld] = useState<{ dit: boolean; dah: boolean; straight: boolean }>({ dit: false, dah: false, straight: false });
  const surface = useRef<HTMLDivElement | null>(null);

  const apply = (transitions: readonly MorsePaddleTransition[]) => {
    for (const { side, pressed } of transitions) {
      setHeld((previous) => ({ ...previous, [side]: pressed }));
      if (pressed) handlers.current.onPress(side);
      else handlers.current.onRelease(side);
    }
  };
  const tracker = useRef<MorsePaddleTouchTracker | null>(null);
  if (tracker.current === null) tracker.current = new MorsePaddleTouchTracker(keyType === "single" ? "single" : "paddle");

  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of key type only
  useEffect(() => {
    apply(tracker.current!.setMode(keyType === "single" ? "single" : "paddle"));
  }, [keyType]);

  // Changing the key type, or leaving the screen, lets go of whatever is held.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a change of key type and on unmount only
  useEffect(
    () => () => {
      apply(tracker.current!.releaseAll());
    },
    [keyType],
  );

  const sideAt = (event: PointerEvent<HTMLDivElement>): "dit" | "dah" => {
    const box = surface.current?.getBoundingClientRect();
    if (!box || box.width === 0)
      return (event.target as HTMLElement).closest("[data-side]")?.getAttribute("data-side") === "dah" ? "dah" : "dit";
    return event.clientX < box.left + box.width / 2 ? "dit" : "dah";
  };

  const paddleHandlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      apply(tracker.current!.start(event.pointerId, sideAt(event)));
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.buttons === 0) return;
      apply(tracker.current!.move(event.pointerId, sideAt(event)));
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      getSidetone().unlock();
      apply(tracker.current!.end(event.pointerId));
    },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => apply(tracker.current!.end(event.pointerId)),
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => apply(tracker.current!.end(event.pointerId)),
    onTouchEnd: () => getSidetone().unlock(),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  };

  const straightDown = useRef(new Set<number>());
  const straightHandlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const first = straightDown.current.size === 0;
      straightDown.current.add(event.pointerId);
      if (first) {
        setHeld((previous) => ({ ...previous, straight: true }));
        handlers.current.onPress("straight");
      }
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      getSidetone().unlock();
      if (!straightDown.current.delete(event.pointerId) || straightDown.current.size > 0) return;
      setHeld((previous) => ({ ...previous, straight: false }));
      handlers.current.onRelease("straight");
    },
    onTouchEnd: () => getSidetone().unlock(),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  };

  // Levers always send their own side; useKeyer applies the swap, so only the names change here.
  const leftLabel = swapPaddles ? "Dah" : "Dit";
  const rightLabel = swapPaddles ? "Dit" : "Dah";
  const instructions =
    keyType === "straight"
      ? `Straight key: hold it down for as long as each element lasts. On a keyboard, ${keyCodeLabel(bindings.straight)}.`
      : keyType === "bug"
        ? `Bug: hold the left lever for repeating dits, the right one for each dah. On a keyboard, ${keyCodeLabel(bindings.dit)} and ${keyCodeLabel(bindings.dah)}.`
        : `${keyType === "single" ? "Single lever" : "Paddles"}: hold the left lever for ${leftLabel.toLowerCase()}s, the right for ${rightLabel.toLowerCase()}s${keyType === "paddle" ? ", or both at once to alternate" : ""}. On a keyboard, ${keyCodeLabel(bindings.dit)} and ${keyCodeLabel(bindings.dah)}.`;

  return (
    <div className={cn("grid gap-3 rounded-panel border border-border bg-surface p-3 sm:p-4", !live && "opacity-60", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-ink-muted">{live ? "Hold to key" : "Listen: the key is off while the trainer sends"}</p>
        <Lamp keyDown={keyDown} />
      </div>
      {keyType === "straight" ? (
        <div className="flex justify-center py-2">
          <div
            role="img"
            aria-label={instructions}
            className={cn(
              holdable,
              "flex size-44 cursor-pointer flex-col items-center justify-center gap-1 rounded-full border-4 transition-[transform,background-color,border-color] duration-75",
              held.straight || keyDown ? "translate-y-1.5 border-primary bg-primary-soft" : "border-border-strong bg-page",
            )}
            data-testid="morse-straight-key"
            {...straightHandlers}
            onPointerCancel={straightHandlers.onPointerUp}
            onLostPointerCapture={straightHandlers.onPointerUp}
          >
            <span className="text-lead font-medium text-ink">Key</span>
            <span className="rounded-control bg-surface-strong px-1.5 py-0.5 text-micro text-ink-muted">
              {keyCodeLabel(bindings.straight)}
            </span>
          </div>
        </div>
      ) : (
        <div
          ref={surface}
          role="img"
          aria-label={instructions}
          className={cn(holdable, "flex cursor-pointer gap-3")}
          data-testid="morse-paddles"
          {...paddleHandlers}
        >
          <Lever side="dit" label={leftLabel} keyLabel={keyCodeLabel(bindings.dit)} held={held.dit} />
          <Lever side="dah" label={rightLabel} keyLabel={keyCodeLabel(bindings.dah)} held={held.dah} />
        </div>
      )}
    </div>
  );
}
