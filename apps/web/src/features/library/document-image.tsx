import { ImageOff } from "lucide-react";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { isTypingTarget, type ViewerControls, type ViewerState } from "./document-viewer";
import { ViewerMessage } from "./document-viewer-message";
import { MAX_ZOOM, MIN_ZOOM, stepZoom } from "./pdf-layout";

const PADDING = 16;

/**
 * A picture, fitted to the window to begin with. Pressing it (or the zoom controls)
 * switches to its real size, where it can be scrolled around.
 */
export function ImageViewer({
  url,
  title,
  downloadUrl,
  onState,
  controls,
}: {
  url: string;
  title: string;
  downloadUrl: string;
  onState: (state: ViewerState | null) => void;
  controls: Ref<ViewerControls>;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  /** `null` follows the window; a number is a zoom the person chose. */
  const [chosen, setChosen] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const report = useRef(onState);
  report.current = onState;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => setSpace({ width: scroller.clientWidth - PADDING * 2, height: scroller.clientHeight - PADDING * 2 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // A small picture is shown at its real size rather than blown up to fill the window.
  const fit =
    natural && space && space.width > 0 && space.height > 0
      ? Math.min(1, space.width / natural.width, space.height / natural.height)
      : null;
  const zoom = chosen ?? fit;

  useEffect(() => {
    if (zoom === null) return;
    report.current({
      zoom,
      fitted: chosen === null,
      fitLabel: "Fit to window",
      canZoomIn: zoom < MAX_ZOOM - 0.001,
      canZoomOut: zoom > MIN_ZOOM + 0.001,
    });
  }, [zoom, chosen]);
  useEffect(() => () => report.current(null), []);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const zoomBy = useCallback((direction: 1 | -1) => setChosen(stepZoom(zoomRef.current ?? 1, direction)), []);
  useImperativeHandle(controls, () => ({ zoomBy, fit: () => setChosen(null) }), [zoomBy]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "+" || event.key === "=") zoomBy(1);
      else if (event.key === "-" || event.key === "_") zoomBy(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy]);

  if (failed) {
    return (
      <ViewerMessage
        icon={<ImageOff />}
        title="This image could not be shown"
        actions={
          <Button asChild>
            <a href={downloadUrl}>Download original</a>
          </Button>
        }
      >
        <p>The file may be damaged, or in a form this browser cannot draw. You can still download the original.</p>
      </ViewerMessage>
    );
  }

  const atRealSize = zoom !== null && Math.abs(zoom - 1) < 0.001;
  return (
    <section
      ref={scrollerRef}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={title}
      className="scroll-quiet relative min-h-0 flex-1 overflow-auto bg-surface-strong focus-visible:outline-offset-[-2px]"
    >
      <div className="grid min-h-full w-max min-w-full place-items-center p-4">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the zoom buttons and the + and - keys do the same from the keyboard */}
        <img
          src={url}
          alt={title}
          draggable={false}
          onLoad={(event) =>
            setNatural({ width: event.currentTarget.naturalWidth || 300, height: event.currentTarget.naturalHeight || 150 })
          }
          onError={() => setFailed(true)}
          onClick={() => setChosen(chosen === null && !atRealSize ? 1 : null)}
          style={
            natural && zoom !== null ? { width: Math.round(natural.width * zoom), height: Math.round(natural.height * zoom) } : undefined
          }
          className={cn(
            "block max-w-none bg-page outline outline-1 outline-border",
            natural && zoom !== null
              ? chosen === null && !atRealSize
                ? "cursor-zoom-in"
                : chosen !== null
                  ? "cursor-zoom-out"
                  : undefined
              : "invisible absolute",
          )}
        />
        {natural ? null : <Skeleton className="h-[60%] w-full max-w-3xl" />}
      </div>
    </section>
  );
}
