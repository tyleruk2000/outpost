import { ChevronDown, ChevronUp, Ellipsis, Minus, Plus, UnfoldHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { cn, formatNumber } from "@/lib/utils";
import type { ViewerControls, ViewerState } from "./document-viewer";

/** "12 of 340" with the 12 editable, and steps to the page before and after unless they are kept in a menu. */
function PageControls({
  page,
  pageCount,
  onGo,
  steps = true,
}: {
  page: number;
  pageCount: number;
  onGo: (page: number) => void;
  steps?: boolean;
}) {
  const [draft, setDraft] = useState(String(page));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(page));
  }, [page, editing]);

  const commit = () => {
    setEditing(false);
    const wanted = Number(draft);
    if (Number.isInteger(wanted) && wanted >= 1 && wanted <= pageCount) {
      if (wanted !== page) onGo(wanted);
    } else {
      setDraft(String(page));
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {steps ? (
        <>
          <Tooltip label="Previous page">
            <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onGo(page - 1)}>
              <ChevronUp />
            </Button>
          </Tooltip>
          <Tooltip label="Next page">
            <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => onGo(page + 1)}>
              <ChevronDown />
            </Button>
          </Tooltip>
        </>
      ) : null}
      <label className="tabular ml-1.5 flex items-center gap-1.5 text-small whitespace-nowrap text-ink-muted">
        <span className="sr-only">Page</span>
        <input
          value={draft}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          onFocus={(event) => {
            setEditing(true);
            event.currentTarget.select();
          }}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(String(page));
              event.currentTarget.blur();
            }
          }}
          // Wide enough for the longest page number this document has.
          style={{ width: `calc(${Math.max(2, String(pageCount).length)}ch + 1rem)` }}
          className="h-7 rounded-control border border-border-strong bg-page px-1.5 text-center text-ink transition-[border-color,box-shadow] hover:border-ink-faint focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none max-md:h-11 max-md:min-w-11 max-md:text-body md:pointer-coarse:h-11 md:pointer-coarse:min-w-11 md:pointer-coarse:text-body"
        />
        of {formatNumber(pageCount)}
      </label>
    </div>
  );
}

function ZoomControls({ state, controls }: { state: ViewerState; controls: ViewerControls }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-0.5">
      <Tooltip label="Zoom out" shortcut="-">
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={!state.canZoomOut} onClick={() => controls.zoomBy(-1)}>
          <Minus />
        </Button>
      </Tooltip>
      {/* On the narrowest phones the figure gives up its room to the buttons; the page shows the zoom as it is. */}
      <span
        className="tabular w-11 text-center text-small text-ink-muted max-[359px]:hidden"
        role="status"
        aria-label={`Zoom ${Math.round(state.zoom * 100)} percent`}
      >
        {Math.round(state.zoom * 100)}%
      </span>
      <Tooltip label="Zoom in" shortcut="+">
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={!state.canZoomIn} onClick={() => controls.zoomBy(1)}>
          <Plus />
        </Button>
      </Tooltip>
      <Tooltip label={state.fitLabel}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={state.fitLabel}
          aria-pressed={state.fitted}
          onClick={() => controls.fit()}
          className={cn(state.fitted && "bg-primary-soft text-primary-soft-ink hover:bg-primary-soft")}
        >
          <UnfoldHorizontal />
        </Button>
      </Tooltip>
    </div>
  );
}

/**
 * The steps to the page before and after, in a menu: the least used of the controls on a
 * phone, where scrolling and the page number do the same, so that the rest fit 390 px at
 * a finger's size.
 */
function StepMenu({ page, pageCount, onGo }: { page: number; pageCount: number; onGo: (page: number) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More viewing controls">
          <Ellipsis />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem disabled={page <= 1} onSelect={() => onGo(page - 1)}>
          <ChevronUp /> Previous page
        </MenuItem>
        <MenuItem disabled={page >= pageCount} onSelect={() => onGo(page + 1)}>
          <ChevronDown /> Next page
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * Page and zoom controls for whatever viewer is showing. In the top bar they sit together;
 * `spread` is for the strip under the viewer on narrow screens, where they take an end each
 * and the steps between pages go into a menu at the end.
 */
export function ViewerToolbar({
  state,
  controls,
  spread,
  className,
}: {
  state: ViewerState;
  controls: ViewerControls;
  spread?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-x-3", spread && "w-full flex-wrap gap-y-0.5", className)}
      role="toolbar"
      aria-label="Viewing controls"
    >
      {state.page && state.pageCount && controls.goToPage ? (
        <>
          <PageControls page={state.page} pageCount={state.pageCount} onGo={controls.goToPage} steps={!spread} />
          {spread ? null : <span aria-hidden className="h-5 w-px bg-border" />}
        </>
      ) : null}
      <div className={cn("flex items-center gap-0.5", spread && "ml-auto flex-wrap justify-end")}>
        <ZoomControls state={state} controls={controls} />
        {spread && state.page && state.pageCount && controls.goToPage ? (
          <StepMenu page={state.page} pageCount={state.pageCount} onGo={controls.goToPage} />
        ) : null}
      </div>
    </div>
  );
}
