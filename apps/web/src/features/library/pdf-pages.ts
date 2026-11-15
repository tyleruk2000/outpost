/**
 * Draws the pages of one PDF into a scrolling column.
 *
 * Every page gets a placeholder of the right size straight away, so the scrollbar is
 * honest from the start. Only pages near the viewport are drawn; pages left far behind
 * give their canvas and text back, which is what keeps a thousand-page document light.
 *
 * Nothing in a PDF is allowed to act: there is no annotation layer, so no form fields
 * and no script, and a link is only ever reported to the owner of this class.
 */
import { AnnotationMode, type PDFDocumentProxy, type PDFPageProxy, type RenderTask, TextLayer } from "pdfjs-dist";
import {
  anchorAt,
  CSS_UNITS,
  fitWidthZoom,
  layoutPages,
  MAX_ZOOM,
  MIN_ZOOM,
  PAGE_GAP,
  PAGE_PADDING,
  type PageLayout,
  type PageSize,
  pageInView,
  pagesNear,
  scrollTopFor,
  scrollTopOfPage,
  stepZoom,
} from "./pdf-layout";

export interface PdfViewState {
  /** 1-based number of the page being read. */
  page: number;
  pageCount: number;
  /** 1 is the page's real size. */
  zoom: number;
  /** True while the zoom follows the width of the window. */
  fitsWidth: boolean;
}

export interface PdfPagesOptions {
  pdf: PDFDocumentProxy;
  /** The element that scrolls. */
  scroller: HTMLElement;
  /** The element inside it that holds the pages. */
  column: HTMLElement;
  firstPage: PDFPageProxy;
  initialPage: number;
  onChange: (state: PdfViewState) => void;
  /** A link in the PDF that points outside it was pressed. It is shown, never followed. */
  onExternalLink: (url: string) => void;
}

interface PageView {
  element: HTMLDivElement;
  page?: PDFPageProxy;
  canvas?: HTMLCanvasElement;
  renderTask?: RenderTask;
  textLayer?: TextLayer;
  /** Zoom the current canvas was drawn at; 0 when there is none. */
  drawnAt: number;
  busy: boolean;
}

/** Browsers refuse or mis-draw very large canvases; beyond this many pixels the page is drawn less sharply instead. */
const MAX_CANVAS_PIXELS = 4096 * 4096;
const MAX_PIXEL_RATIO = 3;

const sizeOf = (page: PDFPageProxy): PageSize => {
  const viewport = page.getViewport({ scale: CSS_UNITS });
  return { width: viewport.width, height: viewport.height };
};

const isCancelled = (error: unknown) => {
  const name = (error as { name?: string } | null)?.name;
  return name === "RenderingCancelledException" || name === "AbortException";
};

export class PdfPages {
  readonly #pdf: PDFDocumentProxy;
  readonly #scroller: HTMLElement;
  readonly #column: HTMLElement;
  readonly #onChange: PdfPagesOptions["onChange"];
  readonly #onExternalLink: PdfPagesOptions["onExternalLink"];
  readonly #views: PageView[] = [];
  readonly #sizes: PageSize[];
  readonly #resize: ResizeObserver;
  #layout: PageLayout;
  #zoom = 1;
  #fitsWidth = true;
  #current = 0;
  /** A page the person asked for by number. It stays "the page being read" until they scroll themselves. */
  #pinned: { page: number; scrollTop: number } | null = null;
  #frame = 0;
  #redraw = 0;
  #drawing = false;
  #destroyed = false;

  constructor(options: PdfPagesOptions) {
    this.#pdf = options.pdf;
    this.#scroller = options.scroller;
    this.#column = options.column;
    this.#onChange = options.onChange;
    this.#onExternalLink = options.onExternalLink;

    // Until a page has been opened its size is taken to be the first page's, which is right for most documents.
    const first = sizeOf(options.firstPage);
    this.#sizes = Array.from({ length: this.#pdf.numPages }, () => first);
    this.#zoom = fitWidthZoom(first.width, this.#scroller.clientWidth);
    this.#layout = layoutPages(this.#sizes, this.#zoom);

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < this.#pdf.numPages; index++) {
      const element = document.createElement("div");
      element.className = "pdf-page";
      element.dataset.page = String(index + 1);
      element.setAttribute("role", "group");
      element.setAttribute("aria-label", `Page ${index + 1}`);
      this.#views.push({ element, drawnAt: 0, busy: false });
      fragment.append(element);
    }
    this.#views[0]!.page = options.firstPage;
    // The same numbers the layout arithmetic uses, so the two cannot drift apart.
    this.#column.style.gap = `${PAGE_GAP}px`;
    this.#column.style.padding = `${PAGE_PADDING}px`;
    this.#column.replaceChildren(fragment);
    this.#applyLayout();

    const start = Math.min(Math.max(options.initialPage, 1), this.#pdf.numPages) - 1;
    this.#current = start;
    if (start > 0) this.#scrollToPage(start);

    this.#scroller.addEventListener("scroll", this.#onScroll, { passive: true });
    this.#column.addEventListener("click", this.#onClick);
    this.#column.addEventListener("pointerdown", this.#onPointerDown);
    document.addEventListener("pointerup", this.#onPointerUp);
    this.#resize = new ResizeObserver(() => this.#onResize());
    this.#resize.observe(this.#scroller);
    this.#report();
    this.#update();
  }

  get state(): PdfViewState {
    return { page: this.#current + 1, pageCount: this.#pdf.numPages, zoom: this.#zoom, fitsWidth: this.#fitsWidth };
  }

  goToPage(page: number): void {
    const index = Math.min(Math.max(Math.round(page), 1), this.#pdf.numPages) - 1;
    this.#scrollToPage(index);
    this.#current = index;
    this.#report();
    this.#update();
  }

  zoomBy(direction: 1 | -1): void {
    this.#setZoom(stepZoom(this.#zoom, direction), false);
  }

  fitWidth(): void {
    this.#setZoom(fitWidthZoom(this.#widestPage(), this.#scroller.clientWidth), true);
  }

  scrollBy(pages: number, lines = 0): void {
    this.#scroller.scrollBy({ top: pages * this.#scroller.clientHeight * 0.9 + lines * 56 });
  }

  scrollToEdge(edge: "start" | "end"): void {
    this.#scroller.scrollTo({ top: edge === "start" ? 0 : this.#scroller.scrollHeight });
  }

  destroy(): void {
    this.#destroyed = true;
    cancelAnimationFrame(this.#frame);
    window.clearTimeout(this.#redraw);
    this.#resize.disconnect();
    this.#scroller.removeEventListener("scroll", this.#onScroll);
    this.#column.removeEventListener("click", this.#onClick);
    this.#column.removeEventListener("pointerdown", this.#onPointerDown);
    document.removeEventListener("pointerup", this.#onPointerUp);
    for (const view of this.#views) this.#release(view);
    this.#column.replaceChildren();
    TextLayer.cleanup();
  }

  // ── Layout ──

  #widestPage(): number {
    return this.#sizes.reduce((widest, size) => Math.max(widest, size.width), 0);
  }

  #applyLayout(): void {
    const { widths, heights } = this.#layout;
    // pdf.js sizes and places the text of a page from these properties.
    this.#column.style.setProperty("--total-scale-factor", String(this.#zoom * CSS_UNITS));
    this.#views.forEach((view, index) => {
      view.element.style.width = `${widths[index]}px`;
      view.element.style.height = `${heights[index]}px`;
    });
  }

  /** Lays the pages out again without moving what the person is looking at. */
  #relayout(change: () => void): void {
    const anchor = this.#pinned ? null : anchorAt(this.#layout, this.#scroller.scrollTop);
    const across =
      this.#scroller.scrollWidth > 0 ? (this.#scroller.scrollLeft + this.#scroller.clientWidth / 2) / this.#scroller.scrollWidth : 0.5;
    change();
    this.#layout = layoutPages(this.#sizes, this.#zoom);
    this.#applyLayout();
    if (this.#pinned) this.#scrollToPage(this.#pinned.page);
    else if (anchor) this.#scroller.scrollTop = scrollTopFor(this.#layout, anchor);
    if (this.#scroller.scrollWidth > this.#scroller.clientWidth)
      this.#scroller.scrollLeft = across * this.#scroller.scrollWidth - this.#scroller.clientWidth / 2;
  }

  #scrollToPage(index: number): void {
    this.#scroller.scrollTop = scrollTopOfPage(this.#layout, index);
    // Near the end the browser cannot scroll that far; remember where it actually stopped.
    this.#pinned = { page: index, scrollTop: this.#scroller.scrollTop };
  }

  #setZoom(zoom: number, fitsWidth: boolean): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.#fitsWidth = fitsWidth;
    if (Math.abs(next - this.#zoom) > 0.0001) {
      this.#relayout(() => {
        this.#zoom = next;
      });
      // The pages already drawn are stretched to the new size at once, then drawn sharply after a moment.
      window.clearTimeout(this.#redraw);
      this.#redraw = window.setTimeout(() => this.#update(), 160);
    }
    this.#report();
  }

  #setSize(index: number, size: PageSize): void {
    const known = this.#sizes[index]!;
    if (Math.abs(known.width - size.width) < 0.5 && Math.abs(known.height - size.height) < 0.5) return;
    this.#relayout(() => {
      this.#sizes[index] = size;
    });
  }

  #onResize(): void {
    if (this.#destroyed || this.#scroller.clientWidth === 0) return;
    if (this.#fitsWidth) this.#setZoom(fitWidthZoom(this.#widestPage(), this.#scroller.clientWidth), true);
    this.#schedule();
  }

  // ── Following the scroll position ──

  readonly #onScroll = (): void => this.#schedule();

  #schedule(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#update());
  }

  #report(): void {
    this.#onChange(this.state);
  }

  #update(): void {
    if (this.#destroyed) return;
    const { scrollTop, clientHeight } = this.#scroller;
    if (clientHeight === 0) return;

    if (this.#pinned && Math.abs(scrollTop - this.#pinned.scrollTop) > 2) this.#pinned = null;
    const current = this.#pinned ? this.#pinned.page : pageInView(this.#layout, scrollTop, clientHeight);
    if (current !== this.#current) {
      this.#current = current;
      this.#report();
    }

    // Keep what is within a few screens; let go of the rest.
    const [keepFrom, keepTo] = pagesNear(this.#layout, scrollTop, clientHeight, clientHeight * 3);
    this.#views.forEach((view, index) => {
      if ((index < keepFrom || index > keepTo) && (view.canvas || view.busy)) this.#release(view);
    });
    void this.#draw();
  }

  /** The page most in need of drawing: on or next to the screen, not yet sharp at this zoom, nearest the one being read. */
  #nextToDraw(): number {
    const { scrollTop, clientHeight } = this.#scroller;
    const [from, to] = pagesNear(this.#layout, scrollTop, clientHeight, clientHeight);
    let best = -1;
    for (let index = from; index <= to; index++) {
      const view = this.#views[index]!;
      if (view.busy || view.drawnAt === this.#zoom) continue;
      if (best === -1 || Math.abs(index - this.#current) < Math.abs(best - this.#current)) best = index;
    }
    return best;
  }

  /** Draws one page at a time, so scrolling stays smooth and a page that scrolls away can be abandoned. */
  async #draw(): Promise<void> {
    if (this.#drawing) return;
    this.#drawing = true;
    try {
      for (let index = this.#nextToDraw(); index !== -1 && !this.#destroyed; index = this.#nextToDraw()) {
        await this.#drawPage(index);
      }
    } finally {
      this.#drawing = false;
    }
  }

  async #drawPage(index: number): Promise<void> {
    const view = this.#views[index]!;
    const zoom = this.#zoom;
    view.busy = true;
    try {
      const page = view.page ?? (await this.#pdf.getPage(index + 1));
      view.page = page;
      if (this.#destroyed || !view.busy) return;
      this.#setSize(index, sizeOf(page));

      const viewport = page.getViewport({ scale: zoom * CSS_UNITS });
      const ratio = Math.min(
        Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
      canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.setAttribute("aria-hidden", "true");

      view.renderTask = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        // Annotations are painted as part of the picture. Nothing interactive is created for them.
        annotationMode: AnnotationMode.ENABLE,
      });
      await view.renderTask.promise;
      view.renderTask = undefined;
      if (this.#destroyed || !view.busy) return;

      // Swap the sharp canvas in only once it is complete, so zooming never flashes a blank page.
      view.canvas?.remove();
      view.canvas = canvas;
      view.drawnAt = zoom;
      view.element.prepend(canvas);
      view.element.dataset.drawn = "true";

      if (!view.textLayer) {
        await this.#addText(view, page);
        if (this.#destroyed || !view.busy) return;
        await this.#addLinks(view, page);
      }
    } catch (error) {
      if (!isCancelled(error) && !this.#destroyed) {
        // Leave the placeholder marked, and do not try this page again at this zoom.
        view.drawnAt = zoom;
        view.element.dataset.failed = "true";
        view.element.textContent = `Page ${index + 1} could not be drawn.`;
      }
    } finally {
      view.busy = false;
    }
  }

  /** The invisible, selectable text that sits exactly over the picture of the page. */
  async #addText(view: PageView, page: PDFPageProxy): Promise<void> {
    const container = document.createElement("div");
    container.className = "pdf-text";
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale: this.#zoom * CSS_UNITS }),
    });
    view.textLayer = textLayer;
    await textLayer.render();
    if (view.textLayer !== textLayer) return;
    const end = document.createElement("div");
    end.className = "pdf-text-end";
    container.append(end);
    view.element.append(container);
  }

  /** Links are drawn as plain buttons over the page: one inside the document jumps there, one to the web is only reported. */
  async #addLinks(view: PageView, page: PDFPageProxy): Promise<void> {
    const annotations = (await page.getAnnotations({ intent: "display" })) as Array<{
      subtype?: string;
      rect?: number[];
      url?: string;
      unsafeUrl?: string;
      dest?: unknown;
    }>;
    const links = annotations.filter(
      (annotation) => annotation.subtype === "Link" && annotation.rect && (annotation.url || annotation.unsafeUrl || annotation.dest),
    );
    if (links.length === 0 || !view.canvas) return;
    const viewport = page.getViewport({ scale: 1 });
    const layer = document.createElement("div");
    layer.className = "pdf-links";
    for (const link of links) {
      const [left, bottom, right, top] = link.rect as [number, number, number, number];
      const [x1, y1] = viewport.convertToViewportPoint(left, bottom) as [number, number];
      const [x2, y2] = viewport.convertToViewportPoint(right, top) as [number, number];
      const button = document.createElement("button");
      button.type = "button";
      button.style.left = `${(Math.min(x1, x2) / viewport.width) * 100}%`;
      button.style.top = `${(Math.min(y1, y2) / viewport.height) * 100}%`;
      button.style.width = `${(Math.abs(x2 - x1) / viewport.width) * 100}%`;
      button.style.height = `${(Math.abs(y2 - y1) / viewport.height) * 100}%`;
      const url = link.url ?? link.unsafeUrl;
      if (url) {
        button.dataset.url = url;
        button.title = url;
        button.setAttribute("aria-label", `Link to ${url}`);
      } else {
        button.dataset.dest = JSON.stringify(link.dest);
        button.setAttribute("aria-label", "Link to another page of this document");
      }
      layer.append(button);
    }
    view.element.append(layer);
  }

  #release(view: PageView): void {
    view.busy = false;
    view.renderTask?.cancel();
    view.renderTask = undefined;
    view.textLayer?.cancel();
    view.textLayer = undefined;
    if (view.canvas) {
      // Shrinking a canvas hands its memory back at once rather than at the next garbage collection.
      view.canvas.width = 0;
      view.canvas.height = 0;
      view.canvas = undefined;
    }
    view.drawnAt = 0;
    view.element.replaceChildren();
    delete view.element.dataset.drawn;
    delete view.element.dataset.failed;
    view.page?.cleanup();
  }

  // ── Links and selection ──

  readonly #onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".pdf-links button");
    if (!button) return;
    if (button.dataset.url) this.#onExternalLink(button.dataset.url);
    else if (button.dataset.dest) void this.#followDestination(JSON.parse(button.dataset.dest) as unknown);
  };

  async #followDestination(destination: unknown): Promise<void> {
    try {
      const explicit = typeof destination === "string" ? await this.#pdf.getDestination(destination) : destination;
      const target = Array.isArray(explicit) ? (explicit[0] as unknown) : null;
      if (target === null || target === undefined || this.#destroyed) return;
      const index = typeof target === "number" ? target : await this.#pdf.getPageIndex(target as { num: number; gen: number });
      if (!this.#destroyed) this.goToPage(index + 1);
    } catch {
      // A link to a page that does not exist goes nowhere.
    }
  }

  // While a selection is being dragged, a layer under the text catches the pointer between
  // lines, which stops the selection jumping to the whole page.
  readonly #onPointerDown = (event: PointerEvent): void => {
    (event.target as HTMLElement).closest(".pdf-text")?.classList.add("selecting");
  };

  readonly #onPointerUp = (): void => {
    for (const layer of this.#column.querySelectorAll(".pdf-text.selecting")) layer.classList.remove("selecting");
  };
}
