/**
 * The page hierarchy as a tree: disclosure, keyboard movement, and reordering or
 * nesting by drag and drop. Used on the dark spine and, on phones, on the notes home.
 *
 * Only the rows of expanded branches exist, each row is memoised, and the row menu is a
 * single shared menu. Past a couple of hundred rows only those near the part on screen
 * are drawn (`tree-window.ts`), so the tree stays light with thousands of pages open.
 *
 * A page is moved with a mouse by the browser's own drag and drop, and with a finger by
 * a long press. Both find their target from where the pointer is in the tree rather
 * than from the row element under it, so they work on rows that are not drawn.
 */
import type { NoteTreeItem } from "@outpost/shared";
import { ArrowDown, ArrowUp, ChevronRight, Ellipsis, Plus } from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useIsTouch } from "./editor/use-touch";
import { MoveDialog } from "./move-dialog";
import { displayTitle, useNoteActions } from "./notes-data";
import { PageIcon, PageMenuItems } from "./page-bits";
import {
  ancestorIds,
  type DropTarget,
  type DropZone,
  dropTargetAt,
  END,
  isSelfOrDescendant,
  moveAmongSiblings,
  type TreeIndex,
  type TreeRow,
  visibleRows,
} from "./tree-model";
import { edgeSpeed, scrollByY, treeContinues, useTreeWindow, viewOf } from "./tree-window";

export type TreeTone = "spine" | "page";

const DRAG_TYPE = "application/x-outpost-page";
const EXPANDED_KEY = "outpost.notes.expanded";
/** How long a finger rests on a page before it is picked up. */
export const LONG_PRESS_MS = 400;
/** A finger that travels further than this before then was scrolling, not pressing. */
const PRESS_SLOP = 10;
/** A dragged page has to travel this far before the edges of the list start to scroll it. */
const CARRY_SLOP = 16;
/** Resting on a closed page this long while dragging opens it. */
const HOVER_OPEN_MS = 650;

const tones = {
  spine: {
    row: "text-spine-ink-muted hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink",
    current: "bg-spine-active text-spine-ink font-medium hover:bg-spine-active",
    untitled: "text-spine-ink-muted/75",
    button: "text-spine-ink-muted hover:bg-spine-active hover:text-spine-ink focus-visible:outline-spine-ink",
    line: "bg-spine-ink",
    inside: "bg-spine-active text-spine-ink ring-1 ring-inset ring-spine-ink/60",
  },
  page: {
    row: "text-ink hover:bg-surface",
    current: "bg-primary-soft text-primary-soft-ink font-medium hover:bg-primary-soft",
    untitled: "text-ink-muted",
    button: "text-ink-muted hover:bg-surface-strong hover:text-ink",
    line: "bg-primary",
    inside: "bg-primary-soft text-primary-soft-ink ring-1 ring-inset ring-primary/50",
  },
} as const;

function readExpanded(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Which branches are open. Remembered on this device; the branch holding the open page opens itself. */
function useExpanded(index: TreeIndex, currentId: string | undefined) {
  const [expanded, setExpanded] = useState(readExpanded);

  const update = useCallback((change: (current: Set<string>) => Set<string>) => {
    setExpanded((current) => {
      const next = change(current);
      if (next === current) return current;
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        // Storage can be unavailable; the tree then just forgets on reload.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!currentId) return;
    const ancestors = ancestorIds(index, currentId);
    update((current) => (ancestors.every((id) => current.has(id)) ? current : new Set([...current, ...ancestors])));
  }, [index, currentId, update]);

  const setOpen = useCallback(
    (id: string, open: boolean) =>
      update((current) => {
        if (current.has(id) === open) return current;
        const next = new Set(current);
        if (open) next.add(id);
        else next.delete(id);
        return next;
      }),
    [update],
  );

  return { expanded, setOpen };
}

interface RowProps {
  row: TreeRow;
  tone: TreeTone;
  current: boolean;
  tabbable: boolean;
  dropZone: DropZone | null;
  dragging: boolean;
  menuOpen: boolean;
  /** Under the pointer or holding the focus: the only rows that carry their buttons. */
  active: boolean;
  touch: boolean;
  /** Distance from the top of the tree, when the tree is windowed and places its rows itself. */
  top: number | undefined;
  onToggle(id: string, open: boolean): void;
  onAddChild(item: NoteTreeItem): void;
  onMenu(item: NoteTreeItem, anchor: DOMRect): void;
}

/** A row is the same row if it shows the same page in the same place; the wrapper object is new on every tree refresh. */
function sameRow(a: RowProps, b: RowProps): boolean {
  return (
    a.row.item === b.row.item &&
    a.row.depth === b.row.depth &&
    a.row.hasChildren === b.row.hasChildren &&
    a.row.expanded === b.row.expanded &&
    a.row.position === b.row.position &&
    a.row.siblings === b.row.siblings &&
    a.tone === b.tone &&
    a.current === b.current &&
    a.tabbable === b.tabbable &&
    a.dropZone === b.dropZone &&
    a.dragging === b.dragging &&
    a.menuOpen === b.menuOpen &&
    a.active === b.active &&
    a.touch === b.touch &&
    a.top === b.top &&
    a.onToggle === b.onToggle &&
    a.onAddChild === b.onAddChild &&
    a.onMenu === b.onMenu
  );
}

const Row = memo(function Row({
  row,
  tone,
  current,
  tabbable,
  dropZone,
  dragging,
  menuOpen,
  active,
  touch,
  top,
  onToggle,
  onAddChild,
  onMenu,
}: RowProps) {
  const { item, depth } = row;
  const style = tones[tone];
  const showActions = active || menuOpen || touch;
  const title = displayTitle(item.title);
  const indent = 4 + depth * 14;

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-posinset={row.position}
      aria-setsize={row.siblings}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={current}
      aria-current={current ? "page" : undefined}
      aria-label={title}
      tabIndex={tabbable ? 0 : -1}
      data-row-id={item.id}
      // A finger picks a page up with a long press instead; the browser's own drag would fight it.
      draggable={!touch}
      style={top === undefined ? { paddingLeft: indent } : { paddingLeft: indent, position: "absolute", top, left: 0, right: 0 }}
      className={cn(
        // The height is in rem so that a row grows with the text; windowing measures a drawn row, so it follows.
        "group/row relative flex h-[1.875rem] items-center gap-1 rounded-control pr-1 text-small select-none transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:-outline-offset-2 max-md:h-11 max-md:text-body md:pointer-coarse:h-11 md:pointer-coarse:text-body",
        "[contain-intrinsic-size:auto_1.875rem] [content-visibility:auto] [-webkit-touch-callout:none]",
        style.row,
        current && style.current,
        dropZone === "inside" && style.inside,
        dragging && "opacity-45",
      )}
    >
      {dropZone === "before" || dropZone === "after" ? (
        <span
          aria-hidden
          style={{ left: indent + 6 }}
          className={cn(
            // The round end sits at the indent the page will have, so the level can be read off it.
            "pointer-events-none absolute right-1 z-(--z-sticky) h-0.5 rounded-full before:absolute before:top-1/2 before:-left-1 before:size-1.5 before:-translate-y-1/2 before:rounded-full before:bg-inherit",
            style.line,
            dropZone === "before" ? "top-0" : "bottom-0",
          )}
        />
      ) : null}

      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={row.expanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={() => onToggle(item.id, !row.expanded)}
          // On small screens the button is 44 px, its margins taking back the room it adds, so the title does not move.
          className={cn(
            "relative grid size-5 shrink-0 place-content-center rounded-[4px] max-md:-mx-1.5 max-md:size-11 md:pointer-coarse:-mx-1.5 md:pointer-coarse:size-11",
            style.button,
          )}
        >
          <ChevronRight aria-hidden className={cn("size-3.5 transition-transform", row.expanded && "rotate-90")} strokeWidth={2} />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0 max-md:size-8 md:pointer-coarse:size-8" />
      )}

      <Link
        to={`/notes/${item.id}`}
        tabIndex={-1}
        draggable={false}
        // The title gives up room to the row's buttons only while they are there.
        className={cn("flex h-full min-w-0 flex-1 items-center gap-2 focus:outline-none", showActions && (touch ? "pr-11" : "pr-13"))}
      >
        <PageIcon icon={item.icon} />
        <span className={cn("truncate", !item.title.trim() && !current && style.untitled)}>{title}</span>
      </Link>

      {showActions ? (
        <span className="absolute inset-y-0 right-1 flex items-center">
          {/* On touch screens "new page inside" lives in the row menu, which keeps the rows calm. */}
          {touch ? null : (
            <button
              type="button"
              tabIndex={tabbable ? 0 : -1}
              aria-label={`New page inside ${title}`}
              onClick={() => onAddChild(item)}
              className={cn("grid size-6 place-content-center rounded-[4px]", style.button)}
            >
              <Plus aria-hidden className="size-[15px]" />
            </button>
          )}
          <button
            type="button"
            tabIndex={tabbable ? 0 : -1}
            aria-label={`Actions for ${title}`}
            aria-haspopup="menu"
            onClick={(event) => onMenu(item, event.currentTarget.getBoundingClientRect())}
            className={cn("grid size-6 place-content-center rounded-[4px]", touch && "size-11", style.button)}
          >
            <Ellipsis aria-hidden className="size-[15px]" />
          </button>
        </span>
      ) : null}
    </div>
  );
}, sameRow);

interface MenuState {
  item: NoteTreeItem;
  anchor: { left: number; top: number; width: number; height: number };
}

/** The page a finger is carrying. */
interface Lifted {
  id: string;
  pointerId: number;
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null) =>
  a === b || (a !== null && b !== null && a.id === b.id && a.zone === b.zone && a.depth === b.depth);

export function PageTree({
  index,
  tone,
  currentId,
  label,
}: {
  index: TreeIndex;
  tone: TreeTone;
  currentId: string | undefined;
  label: string;
}) {
  const navigate = useNavigate();
  const actions = useNoteActions();
  const treeRef = useRef<HTMLDivElement>(null);
  const { expanded, setOpen } = useExpanded(index, currentId);
  const rows = useMemo(() => visibleRows(index, expanded), [index, expanded]);
  /** Where each visible page is in `rows`. */
  const place = useMemo(() => new Map(rows.map((row, at) => [row.item.id, at])), [rows]);
  const view = useTreeWindow(treeRef, rows.length);
  const touch = useIsTouch();
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moving, setMoving] = useState<NoteTreeItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [lifted, setLifted] = useState<Lifted | null>(null);
  /** The pointer is over one of the dragged page's own sub-pages, where it cannot go. */
  const [refused, setRefused] = useState(false);

  // One row is in the tab order: the focused one, else the open page, else the first.
  const tabId =
    focusId !== undefined && place.has(focusId) ? focusId : currentId !== undefined && place.has(currentId) ? currentId : rows[0]?.item.id;

  // ── Focus ──

  const pendingFocus = useRef<string | null>(null);
  const findRow = useCallback((id: string) => treeRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`), []);

  const focusRow = useCallback(
    (id: string) => {
      const at = place.get(id);
      // A row that is not drawn is scrolled to first; holding the focus then keeps it drawn.
      if (view.windowed && at !== undefined) view.reveal(at);
      setFocusId(id);
      const row = findRow(id);
      if (row) row.focus();
      // A row in a branch that was only just opened, or outside the window, exists after the next render.
      else pendingFocus.current = id;
    },
    [place, view.windowed, view.reveal, findRow],
  );

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const row = findRow(id);
    if (!row) return;
    pendingFocus.current = null;
    row.focus();
  });

  // The open page is brought into view when it changes, and once its branch has opened.
  const revealed = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (currentId === undefined) {
      revealed.current = undefined;
      return;
    }
    const at = place.get(currentId);
    if (at === undefined || revealed.current === currentId) return;
    revealed.current = currentId;
    view.reveal(at, "centre");
  }, [currentId, place, view.reveal]);

  const addChild = useCallback(
    (item: NoteTreeItem) => {
      setOpen(item.id, true);
      void actions.create({ parentId: item.id });
    },
    [actions, setOpen],
  );

  const openMenu = useCallback((item: NoteTreeItem, rect: DOMRect) => {
    setMenu({ item, anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
  }, []);

  /** Up or down one place among its siblings: reordering without dragging. */
  const nudge = (id: string, direction: -1 | 1) => {
    const move = moveAmongSiblings(index, id, direction);
    if (move) void actions.moveWithUndo(index, id, move);
    return move !== null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") !== "treeitem" || event.metaKey || event.ctrlKey) return;
    const at = place.get(target.dataset.rowId ?? "");
    const row = at === undefined ? undefined : rows[at];
    if (at === undefined || !row) return;
    if (event.altKey) {
      // Alt with an arrow moves the page itself.
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      nudge(row.item.id, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    const go = (next: TreeRow | undefined) => {
      event.preventDefault();
      if (next) focusRow(next.item.id);
    };
    switch (event.key) {
      case "ArrowDown":
        return go(rows[at + 1]);
      case "ArrowUp":
        return go(rows[at - 1]);
      case "Home":
        return go(rows[0]);
      case "End":
        return go(rows[rows.length - 1]);
      case "ArrowRight":
        event.preventDefault();
        if (row.hasChildren && !row.expanded) setOpen(row.item.id, true);
        else if (row.expanded) go(rows[at + 1]);
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (row.expanded) setOpen(row.item.id, false);
        else if (row.item.parentId) go(rows[place.get(row.item.parentId) ?? -1]);
        return;
      case "Enter":
        event.preventDefault();
        navigate(`/notes/${row.item.id}`);
        return;
      case "ContextMenu":
        event.preventDefault();
        openMenu(row.item, target.getBoundingClientRect());
        return;
      default:
        if (event.key === "F10" && event.shiftKey) {
          event.preventDefault();
          openMenu(row.item, target.getBoundingClientRect());
        }
    }
  };

  // ── Moving a page: shared by the mouse and the finger ──

  // What the handlers below need as it is now, including in callbacks that outlive a render.
  const live = useRef({ index, rows, stride: view.stride, scroller: view.scroller });
  live.current = { index, rows, stride: view.stride, scroller: view.scroller };
  const dragging = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const hoverOpen = useRef<{ id: string; timer: number } | null>(null);
  const scrolling = useRef<number | null>(null);
  /** Where the drag began, and whether the page has been carried away from there yet. */
  const origin = useRef<{ x: number; y: number } | null>(null);
  const carried = useRef(false);
  /** Which ways the page has been carried from where it was picked up; an edge scrolls only that way. */
  const carriedTowards = useRef({ up: false, down: false });
  /** A finger resting on a row, and whether it has picked the page up yet. */
  const press = useRef<{ pointerId: number; id: string; x: number; y: number; timer: number; lifted: boolean } | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  /** The click that follows lifting a finger must not open the page that was carried. */
  const swallowClick = useRef(false);
  /** Whether the last press on the tree was a finger, whose long press must not open the right-click menu. */
  const byFinger = useRef(false);

  const cancelHoverOpen = useCallback(() => {
    if (hoverOpen.current) window.clearTimeout(hoverOpen.current.timer);
    hoverOpen.current = null;
  }, []);

  /** What a drop at this height in the window would do. */
  const locate = useCallback((clientY: number): DropTarget | null => {
    const tree = treeRef.current;
    const id = dragging.current;
    if (!tree || !id) return null;
    const { index: tree_, rows: shown, stride } = live.current;
    return dropTargetAt(tree_, shown, id, clientY - tree.getBoundingClientRect().top, stride);
  }, []);

  /** Follows the pointer: marks where the page would land, opens a closed page it rests on, scrolls at the edges. */
  const aim = useCallback(
    (x: number, y: number): DropTarget | null => {
      pointer.current = { x, y };
      const target = locate(y);
      setDrop((current) => (sameTarget(current, target) ? current : target));
      const id = dragging.current;
      const tree = treeRef.current;
      const under = tree ? live.current.rows[Math.floor((y - tree.getBoundingClientRect().top) / live.current.stride)] : undefined;
      setRefused(!target && !!id && !!under && under.item.id !== id && isSelfOrDescendant(live.current.index, id, under.item.id));

      const wantsOpen = target?.opens ?? null;
      if (hoverOpen.current?.id !== wantsOpen) {
        cancelHoverOpen();
        if (wantsOpen) hoverOpen.current = { id: wantsOpen, timer: window.setTimeout(() => setOpen(wantsOpen, true), HOVER_OPEN_MS) };
      }

      // A page picked up near an edge does not scroll the list until it has been carried a little.
      origin.current ??= { x, y };
      if (!carried.current) carried.current = Math.hypot(x - origin.current.x, y - origin.current.y) > CARRY_SLOP;
      // A page lifted near the bottom edge and carried upwards is going away from that edge:
      // scrolling would only pull the rows out from under the finger.
      if (y - origin.current.y > CARRY_SLOP) carriedTowards.current.down = true;
      if (origin.current.y - y > CARRY_SLOP) carriedTowards.current.up = true;
      if (carried.current && scrolling.current === null) {
        scrolling.current = requestAnimationFrame(() => {
          scrolling.current = null;
          const at = pointer.current;
          if (!at || !dragging.current) return;
          const scroller = live.current.scroller();
          const view = viewOf(scroller);
          const speed = edgeSpeed(at.y, view);
          const box = treeRef.current?.getBoundingClientRect();
          // Only towards rows that are out of sight; never on past the end of the tree.
          const towards = speed > 0 ? carriedTowards.current.down : carriedTowards.current.up;
          if (speed === 0 || !towards || !box || !treeContinues(box, view, speed)) return;
          scrollByY(scroller, speed);
          // The tree moved under a still pointer: aim again, which also keeps this going.
          aim(at.x, at.y);
        });
      }
      return target;
    },
    [locate, cancelHoverOpen, setOpen],
  );

  const endDrag = useCallback(() => {
    cancelHoverOpen();
    if (scrolling.current !== null) cancelAnimationFrame(scrolling.current);
    scrolling.current = null;
    dragging.current = null;
    pointer.current = null;
    origin.current = null;
    carried.current = false;
    carriedTowards.current = { up: false, down: false };
    setDragId(null);
    setDrop(null);
    setLifted(null);
    setRefused(false);
  }, [cancelHoverOpen]);

  // A branch that opened under a resting pointer changes what is under it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the rows change, which is the point
  useEffect(() => {
    if (dragging.current && pointer.current) aim(pointer.current.x, pointer.current.y);
  }, [rows, aim]);

  useEffect(() => endDrag, [endDrag]);

  const land = (id: string, target: DropTarget) => {
    if (target.zone === "inside" && target.id !== END) setOpen(target.id, true);
    void actions.moveWithUndo(index, id, target.move);
  };

  // ── By mouse: the browser's drag and drop ──

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    // A long press on a touch screen can also start the browser's drag; ours has it.
    if (press.current) {
      event.preventDefault();
      return;
    }
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    if (!id) return;
    event.dataTransfer.setData(DRAG_TYPE, id);
    event.dataTransfer.setData("text/plain", displayTitle(index.byId.get(id)?.title));
    event.dataTransfer.effectAllowed = "move";
    dragging.current = id;
    setDragId(id);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current || press.current) return;
    if (!aim(event.clientX, event.clientY)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (press.current) return;
    const target = locate(event.clientY);
    const id = dragging.current;
    endDrag();
    if (!target || !id) return;
    event.preventDefault();
    land(id, target);
  };

  // ── By touch: a long press picks the page up ──

  const placeChip = useCallback(() => {
    const chip = chipRef.current;
    const at = pointer.current;
    if (!chip || !at) return;
    // Above and a little to the right of the finger, so it is not hidden under it.
    const x = Math.max(8, Math.min(at.x - 28, window.innerWidth - chip.offsetWidth - 8));
    const above = at.y - chip.offsetHeight - 28;
    chip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(above < 8 ? at.y + 36 : above)}px, 0)`;
  }, []);

  const endPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    byFinger.current = event.pointerType !== "mouse";
    swallowClick.current = false;
    if (event.pointerType === "mouse" || !event.isPrimary || press.current) return;
    const element = event.target as HTMLElement;
    // The arrow and the menu button keep their own taps.
    if (element.closest("button")) return;
    const id = element.closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    if (!id) return;
    const { pointerId, clientX, clientY } = event;
    const timer = window.setTimeout(() => {
      const held = press.current;
      if (!held || held.pointerId !== pointerId) return;
      held.lifted = true;
      swallowClick.current = true;
      dragging.current = held.id;
      pointer.current = { x: held.x, y: held.y };
      // Later moves come to the tree even if the row under the finger is redrawn.
      try {
        treeRef.current?.setPointerCapture(pointerId);
      } catch {
        // The finger has already gone; the pointerup that follows ends the press.
      }
      try {
        navigator.vibrate?.(8);
      } catch {
        // No vibration here; the lifted look says the same thing.
      }
      setDragId(held.id);
      setLifted({ id: held.id, pointerId });
      aim(held.x, held.y);
    }, LONG_PRESS_MS);
    press.current = { pointerId, id, x: clientX, y: clientY, timer, lifted: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const held = press.current;
    if (!held || event.pointerId !== held.pointerId) return;
    if (!held.lifted) {
      // Still deciding: a finger that travels is scrolling the list.
      if (Math.hypot(event.clientX - held.x, event.clientY - held.y) > PRESS_SLOP) endPress();
      return;
    }
    aim(event.clientX, event.clientY);
    placeChip();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const held = press.current;
    if (!held || event.pointerId !== held.pointerId) return;
    endPress();
    if (!held.lifted) return;
    // If the browser sends no click after a long press, the next real one must still count.
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 350);
    const target = locate(event.clientY);
    endDrag();
    if (target) land(held.id, target);
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const held = press.current;
    if (!held || event.pointerId !== held.pointerId) return;
    endPress();
    if (held.lifted) endDrag();
  };

  // Once a page is lifted, the finger moves the page, not the list. A browser only
  // honours that from a listener it was told about before the touch began.
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const hold = (event: TouchEvent) => {
      if (press.current?.lifted && event.cancelable) event.preventDefault();
    };
    tree.addEventListener("touchmove", hold, { passive: false });
    return () => tree.removeEventListener("touchmove", hold);
  }, []);

  useEffect(() => endPress, [endPress]);
  useLayoutEffect(() => {
    if (lifted) placeChip();
  });

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // A long press with a finger picks the page up; its menu is the button on the row.
    if (byFinger.current) {
      event.preventDefault();
      return;
    }
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    const item = id ? index.byId.get(id) : undefined;
    if (!item) return;
    event.preventDefault();
    setMenu({ item, anchor: { left: event.clientX, top: event.clientY, width: 0, height: 0 } });
  };

  // ── What is drawn ──

  // Rows near the part on screen, and the few that must stay whatever is on screen: the
  // one holding the focus or the tab stop, the one being dragged, the one whose menu is open.
  const drawn = useMemo(() => {
    if (!view.windowed) return null;
    const set = new Set<number>();
    for (let at = view.range.start; at < view.range.end; at += 1) set.add(at);
    for (const id of [tabId, focusId, dragId, menu?.item.id]) {
      const at = id === undefined || id === null ? undefined : place.get(id);
      if (at !== undefined) set.add(at);
    }
    return [...set].sort((a, b) => a - b);
  }, [view.windowed, view.range.start, view.range.end, tabId, focusId, dragId, menu, place]);

  const renderRow = (row: TreeRow, at: number | undefined) => (
    <Row
      key={row.item.id}
      row={row}
      tone={tone}
      current={row.item.id === currentId}
      tabbable={row.item.id === tabId}
      dropZone={drop?.id === row.item.id ? drop.zone : null}
      dragging={row.item.id === dragId}
      menuOpen={menu?.item.id === row.item.id}
      active={row.item.id === hoverId || row.item.id === focusId}
      touch={touch}
      top={at === undefined ? undefined : at * view.stride}
      onToggle={setOpen}
      onAddChild={addChild}
      onMenu={openMenu}
    />
  );

  const liftedItem = lifted ? index.byId.get(lifted.id) : undefined;
  const menuItem = menu ? index.byId.get(menu.item.id) : undefined;

  return (
    <>
      <div
        ref={treeRef}
        role="tree"
        aria-label={label}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
        onPointerOver={(event) => {
          const id = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]")?.dataset.rowId ?? null;
          if (id !== hoverId) setHoverId(id);
        }}
        onPointerLeave={() => setHoverId(null)}
        onFocus={(event) => {
          const id = (event.target as HTMLElement).dataset.rowId;
          if (id) setFocusId(id);
        }}
        onDragStart={onDragStart}
        // Entering a row counts as being over it: Chrome sends no "dragover" for a move that changes the row.
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            cancelHoverOpen();
            pointer.current = null;
            setDrop(null);
          }
        }}
        onDrop={onDrop}
        onDragEnd={endDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        // Windowed, the tree is as tall as all of its rows and places the drawn ones itself.
        style={drawn ? { height: `calc(${rows.length * view.stride - 1}px + 1.5rem)` } : undefined}
        className="relative flex flex-col gap-px pb-6"
      >
        {drawn
          ? drawn.map((at) => {
              const row = rows[at];
              return row ? renderRow(row, at) : null;
            })
          : rows.map((row) => renderRow(row, undefined))}
        {drop?.id === END ? (
          <span aria-hidden className={cn("pointer-events-none absolute inset-x-2 bottom-5 h-0.5 rounded-full", tones[tone].line)} />
        ) : null}
      </div>

      {lifted && liftedItem
        ? createPortal(
            <div ref={chipRef} aria-hidden data-page-lifted className="pointer-events-none fixed top-0 left-0 z-(--z-toast)">
              <div className="flex max-w-[min(19rem,calc(100vw-1rem))] animate-enter items-center gap-2.5 rounded-control border border-border-strong bg-raised py-2 pr-3.5 pl-3 text-ink shadow-float">
                <PageIcon icon={liftedItem.icon} className="text-ink-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium">{displayTitle(liftedItem.title)}</span>
                  <span className="block truncate text-micro text-ink-muted">{landingLabel(index, drop, refused)}</span>
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}

      <RowMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onMove={(item) => setMoving(item)}
        onAddChild={addChild}
        onNudge={(item, direction) => nudge(item.id, direction)}
        canNudge={
          menuItem
            ? { up: moveAmongSiblings(index, menuItem.id, -1) !== null, down: moveAmongSiblings(index, menuItem.id, 1) !== null }
            : undefined
        }
        currentId={currentId}
        returnFocus={(id) => focusRow(id)}
      />
      {moving ? <MoveDialog page={moving} index={index} onClose={() => setMoving(null)} /> : null}
    </>
  );
}

/** In words, where the carried page will land: the finger is usually on top of the mark. */
function landingLabel(index: TreeIndex, drop: DropTarget | null, refused: boolean): string {
  if (drop) {
    if (drop.id === END) return "At the end of the top level";
    const title = `“${displayTitle(index.byId.get(drop.id)?.title)}”`;
    return drop.zone === "inside" ? `Inside ${title}` : drop.zone === "before" ? `Before ${title}` : `After ${title}`;
  }
  return refused ? "A page cannot go inside itself" : "Drag to where it should go";
}

/**
 * One menu for every row, anchored to an invisible box placed over the button (or the
 * pointer, for a right-click). A menu per row would cost thousands of components.
 */
export function RowMenu({
  menu,
  onClose,
  onMove,
  onAddChild,
  onNudge,
  canNudge,
  currentId,
  returnFocus,
}: {
  menu: MenuState | null;
  onClose(): void;
  onMove(item: NoteTreeItem): void;
  onAddChild?(item: NoteTreeItem): void;
  /** Where the order of pages shows (the tree), a page can be moved up or down a place from its menu. */
  onNudge?(item: NoteTreeItem, direction: -1 | 1): void;
  canNudge?: { up: boolean; down: boolean };
  currentId: string | undefined;
  returnFocus?(id: string): void;
}) {
  const actions = useNoteActions();
  // Keep the last item while the menu animates shut.
  const last = useRef<MenuState | null>(null);
  if (menu) last.current = menu;
  const shown = menu ?? last.current;

  return (
    <Menu open={menu !== null} onOpenChange={(open) => !open && onClose()}>
      <MenuTrigger asChild>
        <span
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed"
          style={shown?.anchor ?? { left: 0, top: 0, width: 0, height: 0 }}
        />
      </MenuTrigger>
      {shown ? (
        <MenuContent
          align="start"
          // Comfortable under a thumb on small screens.
          className="max-md:[&_[role=menuitem]]:min-h-11"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus?.(shown.item.id);
          }}
        >
          {onAddChild ? (
            <>
              <MenuItem onSelect={() => onAddChild(shown.item)}>
                <Plus /> New page inside
              </MenuItem>
              <MenuSeparator />
            </>
          ) : null}
          <PageMenuItems
            page={shown.item}
            isFavorite={shown.item.isFavorite}
            actions={actions}
            onMove={() => onMove(shown.item)}
            openId={currentId}
            afterMove={
              onNudge ? (
                <>
                  <MenuItem disabled={!canNudge?.up} onSelect={() => onNudge(shown.item, -1)}>
                    <ArrowUp /> Move up
                  </MenuItem>
                  <MenuItem disabled={!canNudge?.down} onSelect={() => onNudge(shown.item, 1)}>
                    <ArrowDown /> Move down
                  </MenuItem>
                </>
              ) : null
            }
          />
        </MenuContent>
      ) : null}
    </Menu>
  );
}

export type { MenuState };
