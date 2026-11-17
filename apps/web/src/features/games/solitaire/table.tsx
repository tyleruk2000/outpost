/**
 * The table: the stock, the waste and the four foundations along the top, the seven piles
 * under them. It draws the board and turns presses into what the page acts on: a card or
 * a place activated (by a tap, a click or Enter), or a run dragged and dropped. Every card
 * that can be played and every place is a button with a spoken name; the arrow keys move
 * between them (left and right along a row, up and down a pile and between the rows).
 */
import { RotateCcw } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn, plural } from "@/lib/utils";
import { boardSurface } from "../kit/frame";
import { CardBack, CardFace, Pip } from "./cards";
import {
  type Board,
  type Card,
  capitalise,
  cardName,
  cardOf,
  cardsAt,
  type Draw,
  type Place,
  rankName,
  type Source,
  SUIT_NAMES,
  type Suit,
} from "./engine";
import { layoutFor, pilesHeight } from "./layout";

/** Spades, hearts, clubs, diamonds: the colours alternate along the row. */
export const FOUNDATION_ORDER: readonly Suit[] = [0, 1, 3, 2];

/** What was pressed: a place, and for a pile the face-up card in it (its index among the face-up cards). */
export interface Target {
  place: Place;
  at?: number;
}

/** A press by a finger or a mouse, or by the keyboard or a screen reader. */
export type Via = "pointer" | "keyboard";

export function sourceOf(target: Target): Source | null {
  const { place } = target;
  if (place.kind === "waste") return { kind: "waste" };
  if (place.kind === "foundation") return { kind: "foundation", suit: place.suit };
  if (place.kind === "pile" && target.at !== undefined) return { kind: "pile", index: place.index, at: target.at };
  return null;
}

const sameSource = (a: Source | null, b: Source | null) => JSON.stringify(a) === JSON.stringify(b);

/** Whether a card is among those picked up. */
function isPicked(board: Board, picked: Source | null, card: Card): boolean {
  if (!picked) return false;
  return cardsAt(board, picked)?.includes(card) ?? false;
}

const reducedMotion = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/** A small shake of a card that cannot go where it was asked to; none with reduced motion. */
export function shakeCard(root: HTMLElement | null, card: Card) {
  const element = root?.querySelector<HTMLElement>(`[data-card="${card}"]`);
  if (!element || reducedMotion() || typeof element.animate !== "function") return;
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(-2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 180, easing: "ease-out" },
  );
}

function placeFromKey(key: string): Place | null {
  const [kind, number] = key.split("-");
  if (kind === "stock" || kind === "waste") return { kind };
  if (kind === "pile") return { kind: "pile", index: Number(number) };
  if (kind === "foundation") return { kind: "foundation", suit: Number(number) as Suit };
  return null;
}

interface Drag {
  source: Source;
  cards: Card[];
  dx: number;
  dy: number;
}

export function Table({
  board,
  draw,
  picked,
  onActivate,
  onDrop,
  onKey,
  rootRef,
}: {
  board: Board;
  draw: Draw;
  picked: Source | null;
  onActivate: (target: Target, via: Via) => void;
  onDrop: (source: Source, to: Place | null) => void;
  /** Keys the table does not use itself: Escape, Ctrl+Z. */
  onKey: (event: KeyboardEvent) => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const [width, setWidth] = useState(0);
  const measure = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = measure.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Before the first measure (and in tests) the width of a phone's table.
  const layout = layoutFor(width || 346);

  const [drag, setDrag] = useState<Drag | null>(null);
  const pressRef = useRef<{ source: Source; id: number; x: number; y: number; active: boolean } | null>(null);
  const dragged = useRef(false);

  // Cards that changed place slide from where they were (120 to 200 ms), so a move can be followed by eye.
  const rects = useRef(new Map<string, DOMRect>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the board or the size changes
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const next = new Map<string, DOMRect>();
    const still = reducedMotion();
    const stock = root.querySelector<HTMLElement>("[data-stock]")?.getBoundingClientRect();
    for (const element of root.querySelectorAll<HTMLElement>("[data-card]")) {
      const key = element.dataset.card!;
      const now = element.getBoundingClientRect();
      next.set(key, now);
      const before = rects.current.get(key) ?? (element.dataset.fromStock !== undefined ? stock : undefined);
      if (!before || still || typeof element.animate !== "function") continue;
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: Math.min(200, 120 + Math.hypot(dx, dy) / 6),
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
    rects.current = next;
  }, [board, width]);

  const startPress = (event: PointerEvent, source: Source) => {
    if (event.button !== 0) return;
    pressRef.current = { source, id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
  };
  const movePress = (event: PointerEvent) => {
    const press = pressRef.current;
    if (!press || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.active) {
      if (Math.hypot(dx, dy) < 8) return;
      const cards = cardsAt(board, press.source);
      if (!cards) return;
      press.active = true;
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      setDrag({ source: press.source, cards, dx, dy });
      return;
    }
    setDrag((current) => (current ? { ...current, dx, dy } : current));
  };
  const endPress = (event: PointerEvent) => {
    const press = pressRef.current;
    if (!press || press.id !== event.pointerId) return;
    pressRef.current = null;
    if (!press.active) return;
    // The click that follows a drag is not a tap.
    dragged.current = true;
    window.setTimeout(() => {
      dragged.current = false;
    }, 0);
    let to: Place | null = null;
    for (const element of document.elementsFromPoint?.(event.clientX, event.clientY) ?? []) {
      if (element.closest("[data-dragging]")) continue;
      const zone = element.closest<HTMLElement>("[data-drop]");
      if (zone) {
        to = placeFromKey(zone.dataset.drop!);
        break;
      }
    }
    // The dropped cards slide on from where the finger left them, not from where they started.
    for (const element of rootRef.current?.querySelectorAll<HTMLElement>("[data-dragging]") ?? []) {
      rects.current.set(element.dataset.card!, element.getBoundingClientRect());
    }
    setDrag(null);
    onDrop(press.source, to);
  };
  const cancelPress = () => {
    pressRef.current = null;
    setDrag(null);
  };

  const activate = (target: Target) => (event: MouseEvent) => {
    if (dragged.current) return;
    // A click with no count comes from the keyboard or a screen reader: those pick and put.
    onActivate(target, event.detail === 0 ? "keyboard" : "pointer");
  };

  const dragProps = (source: Source) => ({
    onPointerDown: (event: PointerEvent) => startPress(event, source),
    onPointerMove: movePress,
    onPointerUp: endPress,
    onPointerCancel: cancelPress,
  });

  const dragStyle = (card: Card) => {
    if (!drag?.cards.includes(card)) return undefined;
    return { transform: `translate(${drag.dx}px, ${drag.dy}px)`, zIndex: 40 };
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!keys.includes(event.key)) return onKey(event);
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-nav]");
    const root = rootRef.current;
    if (!from || !root) return;
    const [row, colText, atText] = from.dataset.nav!.split(":");
    const col = Number(colText);
    const at = Number(atText);
    const inRow = (name: string, column: number) =>
      [...root.querySelectorAll<HTMLElement>(`[data-nav^="${name}:${column}:"]`)].sort(
        (a, b) => Number(a.dataset.nav!.split(":")[2]) - Number(b.dataset.nav!.split(":")[2]),
      );
    const topCols = [0, 1, 3, 4, 5, 6];
    let next: HTMLElement | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const step = event.key === "ArrowLeft" ? -1 : 1;
      if (row === "top") {
        const index = topCols.indexOf(col) + step;
        const column = topCols[index];
        if (column !== undefined) next = inRow("top", column).at(-1);
      } else if (col + step >= 0 && col + step < 7) next = inRow("pile", col + step).at(-1);
    } else if (row === "top") {
      if (event.key === "ArrowDown") next = inRow("pile", col).at(-1);
    } else {
      const own = inRow("pile", col);
      const index = own.findIndex((element) => Number(element.dataset.nav!.split(":")[2]) === at);
      if (event.key === "ArrowDown") next = own[index + 1];
      else next = own[index - 1] ?? inRow("top", col === 2 ? 1 : col).at(-1);
    }
    event.preventDefault();
    next?.focus();
  };

  const { width: cw, height: ch, gap } = layout;
  const column = (col: number) => ({ left: col * (cw + gap), width: cw });
  const piles = pilesHeight(board, layout);
  const card =
    "absolute rounded-[5px] border border-game-card-edge bg-game-card shadow-[0_1px_1px_oklch(0_0_0/0.18)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-game-felt-ink";
  const slot =
    "absolute rounded-[5px] border border-game-felt-line text-game-felt-line outline-offset-2 focus-visible:outline-2 focus-visible:outline-game-felt-ink";
  const pickedRing = "ring-3 ring-game-card-picked";

  const stockCount = board.stock.length;
  const wasteShown = board.waste.slice(draw === 3 ? -3 : -2);
  const wasteTop = board.waste.at(-1);

  return (
    <div className="max-w-[calc(7*104px+60px+1.5rem)] rounded-panel bg-game-felt p-1.5 md:p-3">
      <div ref={measure}>
        {/* A group of buttons, not a form: a fieldset would be the wrong thing for a screen reader to announce. */}
        {/* biome-ignore lint/a11y/useSemanticElements: see above */}
        <div
          ref={rootRef}
          role="group"
          aria-label="Table"
          onKeyDown={onKeyDown}
          className={cn("relative", boardSurface)}
          style={{ height: ch + gap * 3 + piles }}
        >
          {/* The stock */}
          <div data-drop="stock" className="absolute top-0" style={{ ...column(0), height: ch }}>
            <button
              type="button"
              data-stock
              data-nav="top:0:0"
              aria-label={
                stockCount > 0
                  ? `Stock, ${plural(stockCount, "card")}`
                  : board.waste.length > 0
                    ? "Stock, empty, turn the waste over"
                    : "Stock, empty"
              }
              onClick={activate({ place: { kind: "stock" } })}
              className={cn(stockCount > 0 ? card : slot, "inset-0 flex items-center justify-center overflow-hidden")}
            >
              {stockCount > 0 ? (
                <>
                  <CardBack />
                  <span className="absolute right-1 bottom-0.5 font-bold text-micro text-game-felt-ink tabular" aria-hidden>
                    {stockCount}
                  </span>
                </>
              ) : board.waste.length > 0 ? (
                <RotateCcw aria-hidden className="size-1/2 max-w-7 text-game-felt-ink" strokeWidth={1.6} />
              ) : null}
            </button>
          </div>

          {/* The waste: in draw three its top three are spread, so the cards to come can be seen. */}
          <div data-drop="waste" className="absolute top-0" style={{ left: cw + gap, width: cw * 2 + gap, height: ch }}>
            {wasteTop === undefined ? (
              <button
                type="button"
                data-nav="top:1:0"
                aria-label="Waste, empty"
                onClick={activate({ place: { kind: "waste" } })}
                className={cn(slot, "top-0 left-0")}
                style={{ width: cw, height: ch }}
              />
            ) : (
              wasteShown.map((shown, index) => {
                const top = shown === wasteTop;
                const offset = draw === 3 ? index * layout.wasteOffset : 0;
                const style = { left: offset, top: 0, width: cw, height: ch, ...dragStyle(shown) };
                return top ? (
                  <button
                    key={shown}
                    type="button"
                    data-card={shown}
                    data-from-stock=""
                    data-nav="top:1:0"
                    data-dragging={drag?.cards.includes(shown) ? "" : undefined}
                    aria-label={`Waste, ${cardName(shown)} on top, ${plural(board.waste.length, "card")}${isPicked(board, picked, shown) ? ", picked up" : ""}`}
                    onClick={activate({ place: { kind: "waste" } })}
                    {...dragProps({ kind: "waste" })}
                    className={cn(card, "touch-none overflow-hidden", isPicked(board, picked, shown) && pickedRing)}
                    style={style}
                  >
                    <CardFace card={shown} layout={layout} />
                  </button>
                ) : (
                  <span key={shown} aria-hidden data-card={shown} data-from-stock="" className={cn(card, "overflow-hidden")} style={style}>
                    <CardFace card={shown} layout={layout} />
                  </span>
                );
              })
            )}
          </div>

          {/* The foundations */}
          {FOUNDATION_ORDER.map((suit, order) => {
            const count = board.foundations[suit];
            const name = SUIT_NAMES[suit];
            const top = count > 0 ? cardOf(suit, count) : null;
            const under = count > 1 ? cardOf(suit, count - 1) : null;
            const label =
              count === 0
                ? `Foundation for ${name}, empty`
                : `Foundation for ${name}, up to the ${rankName(count)}${top !== null && isPicked(board, picked, top) ? ", picked up" : ""}`;
            return (
              <div key={suit} data-drop={`foundation-${suit}`} className="absolute top-0" style={{ ...column(order + 3), height: ch }}>
                <span aria-hidden className={cn(slot, "inset-0 flex items-center justify-center")}>
                  <Pip suit={suit} size={Math.round(cw * 0.4)} className="opacity-70" />
                </span>
                {under !== null ? (
                  <span aria-hidden data-card={under} className={cn(card, "inset-0 overflow-hidden")}>
                    <CardFace card={under} layout={layout} />
                  </span>
                ) : null}
                <button
                  type="button"
                  data-nav={`top:${order + 3}:0`}
                  data-card={top ?? undefined}
                  data-dragging={top !== null && drag?.cards.includes(top) ? "" : undefined}
                  aria-label={label}
                  onClick={activate({ place: { kind: "foundation", suit } })}
                  {...(top !== null ? dragProps({ kind: "foundation", suit }) : {})}
                  className={cn(
                    top !== null ? cn(card, "touch-none overflow-hidden") : slot,
                    "inset-0",
                    top !== null && isPicked(board, picked, top) && pickedRing,
                  )}
                  style={top !== null ? dragStyle(top) : undefined}
                >
                  {top !== null ? <CardFace card={top} layout={layout} /> : null}
                </button>
              </div>
            );
          })}

          {/* The seven piles */}
          {board.piles.map((pile, index) => {
            const number = index + 1;
            const place: Place = { kind: "pile", index };
            const downs = pile.down.length;
            const zone = (children: ReactNode, label?: string) => (
              <div
                // The seven piles are seven fixed places: the index is the pile.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={index}
                data-drop={`pile-${index}`}
                {...(label ? { role: "group", "aria-label": label } : {})}
                className="absolute"
                style={{ ...column(index), top: ch + gap * 3, height: piles }}
              >
                {children}
              </div>
            );
            if (pile.up.length === 0) {
              return zone(
                <button
                  type="button"
                  data-nav={`pile:${index}:0`}
                  aria-label={`Pile ${number}, empty`}
                  onClick={activate({ place })}
                  className={cn(slot, "top-0 left-0 flex items-start justify-center")}
                  style={{ width: cw, height: ch }}
                />,
              );
            }
            return zone(
              <>
                {pile.down.map((down, position) => (
                  <span
                    key={down}
                    aria-hidden
                    data-card={down}
                    className={cn(card, "left-0 overflow-hidden")}
                    style={{ top: position * layout.downOffset, width: cw, height: ch }}
                  >
                    <CardBack />
                  </span>
                ))}
                {pile.up.map((up, at) => {
                  const pickedUp = isPicked(board, picked, up);
                  const source: Source = { kind: "pile", index, at };
                  return (
                    <button
                      key={up}
                      type="button"
                      data-card={up}
                      data-nav={`pile:${index}:${at}`}
                      data-dragging={drag?.cards.includes(up) ? "" : undefined}
                      tabIndex={at === pile.up.length - 1 ? 0 : -1}
                      aria-label={`${capitalise(cardName(up))}, face up${pickedUp ? ", picked up" : ""}`}
                      onClick={activate({ place, at })}
                      {...dragProps(source)}
                      className={cn(
                        card,
                        "left-0 touch-none overflow-hidden",
                        pickedUp && pickedRing,
                        sameSource(picked, source) && "z-10",
                      )}
                      style={{
                        top: downs * layout.downOffset + at * layout.upOffset,
                        width: cw,
                        height: ch,
                        ...dragStyle(up),
                      }}
                    >
                      <CardFace card={up} layout={layout} />
                    </button>
                  );
                })}
              </>,
              downs > 0 ? `Pile ${number}, ${downs} face down` : `Pile ${number}`,
            );
          })}
        </div>
      </div>
    </div>
  );
}
