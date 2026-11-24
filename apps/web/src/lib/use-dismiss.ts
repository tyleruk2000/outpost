import { type RefObject, type SyntheticEvent, useEffect, useRef } from "react";

/**
 * Closes a list of suggestions that drops from a field: on a press anywhere outside `box`,
 * or when focus moves to something outside it (Tab past the last row). Escape and choosing
 * a row are the field's own to handle.
 *
 * Not on the field's blur, which is what lists here used to close on. Safari on an iPhone
 * never focuses a button that is tapped: the field lost focus to the panel round the list
 * at the touch, the list closed, and the row under the finger was gone before its click,
 * so a suggestion could not be chosen at all. Rows keep the field focused instead
 * (`keepFieldFocus`), and only a press or focus somewhere else closes the list.
 */
export function useDismiss(box: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null) => target instanceof Node && !box.current?.contains(target);
    const onPress = (event: PointerEvent) => {
      if (outside(event.target)) latest.current();
    };
    const onFocus = (event: FocusEvent) => {
      if (outside(event.target)) latest.current();
    };
    // Focus gone into a frame (an article in the reader) or out of the window: neither is seen by the two above.
    const onLeave = () => latest.current();
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("blur", onLeave);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("blur", onLeave);
    };
  }, [open, box]);
}

const hold = (event: SyntheticEvent) => event.preventDefault();

/**
 * Spread on a list of suggestions (or each row): a press on it leaves focus in the field,
 * so the keyboard stays up on a phone and nothing outside the list takes focus meanwhile.
 * The row's click still comes.
 */
export const keepFieldFocus = { onPointerDown: hold, onMouseDown: hold } as const;
