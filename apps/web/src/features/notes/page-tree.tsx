/**
 * The page hierarchy as a tree: disclosure, keyboard movement, and reordering or
 * nesting by drag and drop. Used on the dark spine and, on phones, on the notes home.
 *
 * Only the rows of expanded branches exist, each row is memoised, and the row menu is a
 * single shared menu, so the tree stays light with thousands of pages.
 */
import type { NoteTreeItem } from "@outpost/shared";
import { ChevronRight, Ellipsis, Plus } from "lucide-react";
import { type DragEvent, type KeyboardEvent, type MouseEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useIsTouch } from "./editor/use-touch";
import { MoveDialog } from "./move-dialog";
import { displayTitle, useNoteActions } from "./notes-data";
import { PageIcon, PageMenuItems } from "./page-bits";
import { ancestorIds, type DropZone, dropZoneAt, moveForDrop, type TreeIndex, type TreeRow, visibleRows } from "./tree-model";

export type TreeTone = "spine" | "page";

const DRAG_TYPE = "application/x-outpost-page";
const EXPANDED_KEY = "outpost.notes.expanded";
/** Stands for "after the last top-level page" as a drop target. */
const END = "\u0000end";

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
      draggable
      style={{ paddingLeft: indent }}
      className={cn(
        "group/row relative flex h-[30px] items-center gap-1 rounded-control pr-1 text-small select-none transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 max-md:h-11 max-md:text-body",
        "[contain-intrinsic-size:auto_30px] [content-visibility:auto]",
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
            "pointer-events-none absolute right-1 z-(--z-sticky) h-0.5 rounded-full",
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
          className={cn("grid size-5 shrink-0 place-content-center rounded-[4px] max-md:size-8", style.button)}
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3.5 transition-transform duration-150 ease-out", row.expanded && "rotate-90")}
            strokeWidth={2}
          />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0 max-md:size-8" />
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
            className={cn("grid size-6 place-content-center rounded-[4px]", touch && "size-10", style.button)}
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
  const touch = useIsTouch();
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moving, setMoving] = useState<NoteTreeItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: DropZone } | null>(null);
  const hoverOpen = useRef<{ id: string; timer: number } | null>(null);

  // One row is in the tab order: the focused one, else the open page, else the first.
  const tabId = rows.some((row) => row.item.id === focusId)
    ? focusId
    : rows.some((row) => row.item.id === currentId)
      ? currentId
      : rows[0]?.item.id;

  const focusRow = useCallback((id: string) => {
    setFocusId(id);
    const find = () => treeRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
    const row = find();
    // A row in a branch that was only just opened exists after the next render.
    if (row) row.focus();
    else requestAnimationFrame(() => find()?.focus());
  }, []);

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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") !== "treeitem" || event.altKey || event.metaKey || event.ctrlKey) return;
    const at = rows.findIndex((row) => row.item.id === target.dataset.rowId);
    const row = rows[at];
    if (!row) return;
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
        else if (row.item.parentId) go(rows.find((candidate) => candidate.item.id === row.item.parentId));
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

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    const item = id ? index.byId.get(id) : undefined;
    if (!item) return;
    event.preventDefault();
    setMenu({ item, anchor: { left: event.clientX, top: event.clientY, width: 0, height: 0 } });
  };

  // ── Drag and drop ──

  const cancelHoverOpen = () => {
    if (hoverOpen.current) window.clearTimeout(hoverOpen.current.timer);
    hoverOpen.current = null;
  };

  const endDrag = () => {
    cancelHoverOpen();
    setDragId(null);
    setDrop(null);
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]")?.dataset.rowId;
    if (!id) return;
    event.dataTransfer.setData(DRAG_TYPE, id);
    event.dataTransfer.setData("text/plain", displayTitle(index.byId.get(id)?.title));
    event.dataTransfer.effectAllowed = "move";
    setDragId(id);
  };

  /** What a drop at the pointer would do, and where to draw it. */
  const targetAt = (event: DragEvent<HTMLDivElement>) => {
    if (!dragId) return null;
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-row-id]");
    if (!element) {
      // The empty space under the tree: to the end of the top level.
      const last = index.childrenOf.get(null)?.at(-1);
      if (!last || last.id === dragId) return null;
      return { id: END, zone: "after" as const, move: { parentId: null } };
    }
    const row = rows.find((candidate) => candidate.item.id === element.dataset.rowId);
    if (!row) return null;
    const rect = element.getBoundingClientRect();
    const zone = dropZoneAt(event.clientY - rect.top, rect.height, row);
    const move = moveForDrop(index, dragId, row.item.id, zone, row.expanded);
    return move ? { id: row.item.id, zone, move, row } : null;
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    const target = targetAt(event);
    if (!target) {
      cancelHoverOpen();
      if (drop) setDrop(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (drop?.id !== target.id || drop.zone !== target.zone) setDrop({ id: target.id, zone: target.zone });

    // Resting on a closed page for a moment opens it, so a page can be dropped deeper.
    const wantsOpen = target.zone === "inside" && target.row?.hasChildren && !target.row.expanded ? target.id : null;
    if (hoverOpen.current?.id !== wantsOpen) {
      cancelHoverOpen();
      if (wantsOpen) hoverOpen.current = { id: wantsOpen, timer: window.setTimeout(() => setOpen(wantsOpen, true), 650) };
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const target = targetAt(event);
    const id = dragId;
    endDrag();
    if (!target || !id) return;
    event.preventDefault();
    if (target.zone === "inside") setOpen(target.id, true);
    void actions.move(id, target.move);
  };

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
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            cancelHoverOpen();
            setDrop(null);
          }
        }}
        onDrop={onDrop}
        onDragEnd={endDrag}
        className="relative flex flex-col gap-px pb-6"
      >
        {rows.map((row) => (
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
            onToggle={setOpen}
            onAddChild={addChild}
            onMenu={openMenu}
          />
        ))}
        {drop?.id === END ? (
          <span aria-hidden className={cn("pointer-events-none absolute inset-x-2 bottom-5 h-0.5 rounded-full", tones[tone].line)} />
        ) : null}
      </div>

      <RowMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onMove={(item) => setMoving(item)}
        onAddChild={addChild}
        currentId={currentId}
        returnFocus={(id) => focusRow(id)}
      />
      {moving ? <MoveDialog page={moving} index={index} onClose={() => setMoving(null)} /> : null}
    </>
  );
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
  currentId,
  returnFocus,
}: {
  menu: MenuState | null;
  onClose(): void;
  onMove(item: NoteTreeItem): void;
  onAddChild?(item: NoteTreeItem): void;
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
          />
        </MenuContent>
      ) : null}
    </Menu>
  );
}

export type { MenuState };
