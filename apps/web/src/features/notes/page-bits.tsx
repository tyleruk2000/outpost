/** Small pieces shared by the tree, the page and the lists. */
import type { NoteRef } from "@outpost/shared";
import { Copy, CornerDownRight, Download, FileText, History, Star, StarOff, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { MenuItem, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { exportUrl, type NoteActions } from "./notes-data";

/** A page's emoji, or a plain page glyph when it has none. */
export function PageIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  if (icon) {
    return (
      <span aria-hidden className={cn("inline-grid size-[1.15em] shrink-0 place-content-center text-[0.95em] leading-none", className)}>
        {icon}
      </span>
    );
  }
  return <FileText aria-hidden strokeWidth={1.6} className={cn("size-[1.05em] shrink-0 opacity-70", className)} />;
}

/** The actions every page offers, wherever its menu is opened from. */
export function PageMenuItems({
  page,
  isFavorite,
  actions,
  onMove,
  openId,
  favourite = true,
  afterMove,
  children,
}: {
  page: NoteRef;
  isFavorite: boolean;
  actions: NoteActions;
  onMove: () => void;
  /** The page on screen, so that trashing it (or a page above it) leaves the screen. */
  openId?: string;
  /** False where a favourite button already sits next to the menu. */
  favourite?: boolean;
  /** More ways to move the page, placed right after "Move to…". */
  afterMove?: ReactNode;
  /** More items, placed before "Move to trash". */
  children?: ReactNode;
}) {
  return (
    <>
      {favourite ? (
        <MenuItem onSelect={() => void actions.setFavorite(page, !isFavorite)}>
          {isFavorite ? <StarOff /> : <Star />} {isFavorite ? "Remove from favourites" : "Add to favourites"}
        </MenuItem>
      ) : null}
      <MenuItem onSelect={() => void actions.duplicate(page)}>
        <Copy /> Duplicate
      </MenuItem>
      <MenuItem onSelect={onMove}>
        <CornerDownRight /> Move to…
      </MenuItem>
      {afterMove}
      <MenuItem asChild>
        <a href={exportUrl(page.id)} download>
          <Download /> Export as Markdown
        </a>
      </MenuItem>
      <MenuItem asChild>
        <Link to={`/notes/${page.id}/versions`}>
          <History /> Earlier versions
        </Link>
      </MenuItem>
      {children}
      <MenuSeparator />
      <MenuItem danger onSelect={() => void actions.trash(page, { openId })}>
        <Trash2 /> Move to trash
      </MenuItem>
    </>
  );
}
