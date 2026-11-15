/**
 * The list that drops down while typing "/" or "[[". Tiptap's suggestion plugin tracks
 * the text and positions the popup (in a portal on the body, so nothing clips it); this
 * file renders the list and handles the arrow keys, Enter and taps.
 */
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { floating } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface PopupItem {
  key: string;
  /** Heading shown above the first item of each group. */
  group?: string;
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** Text on the right: a shortcut or a hint. */
  hint?: ReactNode;
}

export interface PopupHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

interface PopupProps<I> extends SuggestionProps<I, I> {
  ref?: Ref<PopupHandle>;
  label: string;
  describe(item: I, query: string): PopupItem;
  /** Extra choices under the results, such as "Create page". */
  extras?(query: string): I[];
  empty(query: string): ReactNode;
}

function SuggestionList<I>({ ref, items, query, loading, command, label, describe, extras, empty }: PopupProps<I>) {
  const all = [...items, ...(extras?.(query) ?? [])];
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const index = Math.min(active, Math.max(all.length - 1, 0));

  // A new set of results starts at the top again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every change of query or result count
  useEffect(() => setActive(0), [query, items.length]);

  useLayoutEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (all.length === 0) return false;
      if (event.key === "ArrowDown") {
        setActive((index + 1) % all.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((index - 1 + all.length) % all.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = all[index];
        if (item !== undefined) command(item);
        return true;
      }
      return false;
    },
  }));

  let lastGroup: string | undefined;
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      data-editor-popup
      className={cn(floating, "scroll-quiet max-h-[min(22rem,45dvh)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto")}
      // Keeps the cursor in the text while an item is clicked or tapped.
      onMouseDown={(event) => event.preventDefault()}
    >
      {all.length === 0 ? (
        <div className="flex items-center gap-2.5 px-2.5 py-2 text-ink-muted">
          {loading ? <Spinner /> : null} {loading ? "Looking…" : empty(query)}
        </div>
      ) : (
        all.map((item, at) => {
          const view = describe(item, query);
          const heading = view.group !== lastGroup ? view.group : undefined;
          lastGroup = view.group;
          return (
            <div key={view.key}>
              {heading ? (
                <div className={cn("px-2.5 pt-2 pb-1 text-micro font-medium text-ink-faint", at > 0 && "mt-1 border-t border-border")}>
                  {heading}
                </div>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={at === index}
                data-index={at}
                tabIndex={-1}
                onClick={() => command(item)}
                onMouseMove={() => at !== index && setActive(at)}
                className={cn(
                  "flex w-full cursor-default items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left outline-none max-md:py-2.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted",
                  at === index && "bg-surface-strong",
                )}
              >
                {view.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{view.title}</span>
                  {view.detail ? <span className="block truncate text-micro text-ink-muted">{view.detail}</span> : null}
                </span>
                {view.hint ? <span className="shrink-0 font-mono text-micro text-ink-faint">{view.hint}</span> : null}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

/** The `render` option of a suggestion: mounts the list and feeds it what the plugin reports. */
export function popupRenderer<I>(
  config: Pick<PopupProps<I>, "label" | "describe" | "extras" | "empty">,
): NonNullable<SuggestionOptions<I, I>["render"]> {
  return () => {
    let renderer: ReactRenderer<PopupHandle, PopupProps<I>> | undefined;
    let unmount: (() => void) | undefined;
    return {
      onStart(props) {
        renderer = new ReactRenderer<PopupHandle, PopupProps<I>>(SuggestionList<I>, {
          editor: props.editor,
          props: { ...props, ...config },
          className: "z-(--z-dropdown)",
        });
        const element = renderer.element;
        // Hidden until it has a position, then kept inside the window: on a phone the
        // cursor is often too near the right edge for the list to open beside it.
        Object.assign(element.style, { position: "absolute", top: "0", left: "0", width: "max-content", visibility: "hidden" });
        unmount = props.mount(element, {
          onPosition({ x, y, strategy }) {
            const room = document.documentElement.clientWidth - element.offsetWidth - 8;
            Object.assign(element.style, {
              position: strategy,
              left: `${Math.max(8, Math.min(x, room))}px`,
              top: `${y}px`,
              visibility: "",
            });
          },
        });
      },
      onUpdate(props) {
        renderer?.updateProps({ ...props, ...config });
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit() {
        unmount?.();
        renderer?.destroy();
        renderer = undefined;
        unmount = undefined;
      },
    };
  };
}
