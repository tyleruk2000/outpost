/**
 * One tooltip per figure. Marks call `show` on hover and on keyboard focus; the tooltip
 * is a single overlay positioned inside the figure, so a chart with hundreds of marks
 * still has one piece of hover state.
 */
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface TipState {
  /** Anchor point inside the figure box, in pixels: horizontal centre and top edge of the mark. */
  x: number;
  y: number;
  /** Height of the mark, so the tooltip can drop below it when there is no room above. */
  height: number;
  content: ReactNode;
}

export interface TipApi {
  boxRef: RefObject<HTMLDivElement | null>;
  tip: TipState | null;
  show: (target: Element | { clientX: number; clientY: number }, content: ReactNode) => void;
  hide: () => void;
  /** Handlers for a mark: the same content on hover and on focus, Escape to dismiss. */
  bind: (content: ReactNode | (() => ReactNode)) => {
    onPointerEnter: (event: PointerEvent<Element>) => void;
    onPointerLeave: () => void;
    onFocus: (event: FocusEvent<Element>) => void;
    onBlur: () => void;
    onKeyDown: (event: KeyboardEvent<Element>) => void;
  };
}

export function useTip(): TipApi {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback<TipApi["show"]>((target, content) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    if ("getBoundingClientRect" in target) {
      const mark = target.getBoundingClientRect();
      setTip({ x: mark.left + mark.width / 2 - box.left, y: mark.top - box.top, height: mark.height, content });
    } else {
      setTip({ x: target.clientX - box.left, y: target.clientY - box.top, height: 0, content });
    }
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const bind = useCallback<TipApi["bind"]>(
    (content) => {
      const resolve = () => (typeof content === "function" ? content() : content);
      return {
        onPointerEnter: (event) => show(event.currentTarget, resolve()),
        onPointerLeave: hide,
        onFocus: (event) => show(event.currentTarget, resolve()),
        onBlur: hide,
        onKeyDown: (event) => {
          if (event.key === "Escape") hide();
        },
      };
    },
    [show, hide],
  );

  return { boxRef, tip, show, hide, bind };
}

/** The overlay. Render it inside the element that carries `boxRef` (which must be `relative`). */
export function Tip({ tip, boxRef }: { tip: TipState | null; boxRef: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const box = boxRef.current;
    if (!element || !box || !tip) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left = Math.max(0, Math.min(box.clientWidth - width, tip.x - width / 2));
    // Above the mark when there is room on screen, otherwise below it.
    const roomAbove = box.getBoundingClientRect().top + tip.y - height - 10 > 56;
    const top = roomAbove ? tip.y - height - 10 : tip.y + tip.height + 10;
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    element.style.visibility = "visible";
  }, [tip, boxRef]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-(--z-sticky) w-max max-w-[min(20rem,100%)] rounded-control border border-border bg-raised px-3 py-2 text-small text-ink shadow-float"
      style={{ visibility: "hidden" }}
    >
      {tip.content}
    </div>
  );
}

/** Tooltip body: the value first and strong, the name after it, then any detail lines. */
export function TipBody({
  value,
  label,
  children,
  swatch,
}: {
  value?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  swatch?: string;
}) {
  return (
    <div className="grid gap-0.5">
      {value !== undefined ? (
        <p className="tabular flex items-center gap-2 font-semibold text-ink">
          {swatch ? <span aria-hidden className={cn("h-0.5 w-3 shrink-0 rounded-full", swatch)} /> : null}
          {value}
        </p>
      ) : null}
      {label ? <p className="text-ink">{label}</p> : null}
      {children ? <div className="text-micro text-ink-muted">{children}</div> : null}
    </div>
  );
}
