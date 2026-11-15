/** The contract between the document screen's top bar and whatever is showing the document. */

/** What the top bar shows. Reported by the viewer; `null` while it has nothing to control. */
export interface ViewerState {
  /** 1 is the document's real size. */
  zoom: number;
  /** True while the zoom follows the size of the window. */
  fitted: boolean;
  /** What the fit button does here: "Fit width" for pages, "Fit to window" for a picture. */
  fitLabel: string;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** 1-based page being read, for documents that have pages. */
  page?: number;
  pageCount?: number;
}

/** What the top bar can ask of the viewer. */
export interface ViewerControls {
  zoomBy(direction: 1 | -1): void;
  fit(): void;
  goToPage?(page: number): void;
}

/** True when a key press belongs to a text field, so viewer shortcuts must leave it alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return (
    element.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) ||
    Boolean(element.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'))
  );
}
