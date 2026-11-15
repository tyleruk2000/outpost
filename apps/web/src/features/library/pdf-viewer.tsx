import { Copy, FileWarning, LockKeyhole, Unplug, X } from "lucide-react";
import { getDocument, PasswordResponses } from "pdfjs-dist";
import { type FormEvent, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { floating } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { copyText } from "./document-meta";
import { isTypingTarget, type ViewerControls, type ViewerState } from "./document-viewer";
import { ViewerMessage } from "./document-viewer-message";
import { pdfOptions } from "./pdf-assets";
import { MAX_ZOOM, MIN_ZOOM } from "./pdf-layout";
import { PdfPages, type PdfViewState } from "./pdf-pages";
import "./pdf-viewer.css";

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "password"; wrong: boolean; submit: (password: string) => void }
  | { kind: "damaged" }
  | { kind: "missing" }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string };

/** Turns a pdf.js failure into something that can be said to a person. Errors cross a worker boundary, so they are told apart by name. */
function phaseOf(error: unknown): Phase {
  const { name, status, message } = (error ?? {}) as { name?: string; status?: number; message?: string };
  if (name === "InvalidPDFException" || name === "FormatError") return { kind: "damaged" };
  if (name === "ResponseException" && status === 503) return { kind: "unavailable" };
  if (name === "ResponseException" && status === 404) return { kind: "missing" };
  return { kind: "failed", message: message || "The file could not be opened." };
}

const toViewerState = (state: PdfViewState): ViewerState => ({
  page: state.page,
  pageCount: state.pageCount,
  zoom: state.zoom,
  fitted: state.fitsWidth,
  fitLabel: "Fit width",
  canZoomIn: state.zoom < MAX_ZOOM - 0.001,
  canZoomOut: state.zoom > MIN_ZOOM + 0.001,
});

function PasswordForm({ wrong, onSubmit }: { wrong: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) onSubmit(password);
  };
  return (
    <ViewerMessage icon={<LockKeyhole />} title="This PDF is protected with a password">
      <p>Enter it to read the document here. Outpost uses the password for this visit only and does not keep it.</p>
      <form onSubmit={submit} className="grid max-w-xs gap-3 pt-3">
        <Field label="Password" error={wrong ? "That password did not open it. Check it and try again." : undefined} className="text-ink">
          {(ids) => (
            <Input
              {...ids}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          )}
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={!password}>
            Open
          </Button>
        </div>
      </form>
    </ViewerMessage>
  );
}

export interface PdfViewerProps {
  /** Address of the PDF. It is read in byte ranges, never downloaded whole first. */
  url: string;
  title: string;
  /** Page to open at. Later changes are made through `controls`. */
  initialPage: number;
  /** Name of the storage location holding the file, for messages. */
  locationName?: string;
  downloadUrl: string;
  onState: (state: ViewerState | null) => void;
  controls: Ref<ViewerControls>;
}

export default function PdfViewer({ url, title, initialPage, locationName, downloadUrl, onState, controls }: PdfViewerProps) {
  const scrollerRef = useRef<HTMLElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<PdfPages | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [link, setLink] = useState<string | null>(null);
  const report = useRef(onState);
  report.current = onState;
  const startAt = useRef(initialPage);

  useImperativeHandle(
    controls,
    () => ({
      zoomBy: (direction) => pagesRef.current?.zoomBy(direction),
      fit: () => pagesRef.current?.fitWidth(),
      goToPage: (page) => pagesRef.current?.goToPage(page),
    }),
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the "try again" trigger
  useEffect(() => {
    const scroller = scrollerRef.current;
    const column = columnRef.current;
    if (!scroller || !column) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    setLink(null);

    const task = getDocument({ url, ...pdfOptions });
    task.onPassword = (submit: (password: string) => void, reason: number) => {
      if (cancelled) return;
      setPhase({
        kind: "password",
        wrong: reason === PasswordResponses.INCORRECT_PASSWORD,
        submit: (password) => {
          setPhase({ kind: "loading" });
          submit(password);
        },
      });
    };

    void (async () => {
      try {
        const pdf = await task.promise;
        const firstPage = await pdf.getPage(1);
        if (cancelled) return;
        pagesRef.current = new PdfPages({
          pdf,
          scroller,
          column,
          firstPage,
          initialPage: startAt.current,
          onChange: (state) => {
            // If the viewer is opened again (a retry), it comes back to the page being read.
            startAt.current = state.page;
            report.current(toViewerState(state));
          },
          onExternalLink: setLink,
        });
        setPhase({ kind: "ready" });
      } catch (error) {
        if (!cancelled) setPhase(phaseOf(error));
      }
    })();

    return () => {
      cancelled = true;
      pagesRef.current?.destroy();
      pagesRef.current = null;
      report.current(null);
      void task.destroy();
    };
  }, [url, attempt]);

  // Keys work wherever focus is, except in a text field: arrows and Page Up/Down scroll, + and - zoom.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const pages = pagesRef.current;
      if (!pages || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const onControl = Boolean((event.target as HTMLElement).closest?.("button, a"));
      switch (event.key) {
        case "ArrowDown":
          pages.scrollBy(0, 1);
          break;
        case "ArrowUp":
          pages.scrollBy(0, -1);
          break;
        case "PageDown":
          pages.scrollBy(1);
          break;
        case "PageUp":
          pages.scrollBy(-1);
          break;
        case " ":
          // On a button, Space presses the button.
          if (onControl) return;
          pages.scrollBy(event.shiftKey ? -1 : 1);
          break;
        case "Home":
          pages.scrollToEdge("start");
          break;
        case "End":
          pages.scrollToEdge("end");
          break;
        case "+":
        case "=":
          pages.zoomBy(1);
          break;
        case "-":
        case "_":
          pages.zoomBy(-1);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const download = (
    <Button asChild>
      <a href={downloadUrl}>Download original</a>
    </Button>
  );
  const retry = <Button onClick={() => setAttempt((current) => current + 1)}>Try again</Button>;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Always laid out, even while covered by a message, so the pages can be sized the moment the file opens. */}
      <section
        ref={scrollerRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
        tabIndex={0}
        aria-label={`Pages of ${title}`}
        aria-busy={phase.kind === "loading"}
        className="scroll-quiet min-h-0 flex-1 overflow-x-auto overflow-y-scroll bg-surface-strong [overflow-anchor:none] focus-visible:outline-offset-[-2px]"
      >
        <div ref={columnRef} className="pdf-column" />
      </section>

      {phase.kind === "ready" ? null : (
        <div className="absolute inset-0 bg-surface-strong">
          {phase.kind === "loading" ? (
            <div className="flex h-full justify-center overflow-hidden p-4" role="status" aria-label="Opening the PDF">
              <Skeleton className="h-[140%] w-full max-w-[52rem] rounded-none" />
            </div>
          ) : phase.kind === "password" ? (
            <PasswordForm wrong={phase.wrong} onSubmit={phase.submit} />
          ) : phase.kind === "damaged" ? (
            <ViewerMessage icon={<FileWarning />} title="This file could not be read as a PDF" actions={download}>
              <p>It may be damaged or incomplete. You can still download the original and try it in another program.</p>
            </ViewerMessage>
          ) : phase.kind === "unavailable" ? (
            <ViewerMessage icon={<Unplug />} title="The file cannot be reached right now" actions={retry}>
              <p>
                {locationName
                  ? `It is kept on “${locationName}”, which is not connected.`
                  : "The storage location it is kept on is not connected."}{" "}
                Reconnect it and try again.
              </p>
            </ViewerMessage>
          ) : phase.kind === "missing" ? (
            <ViewerMessage icon={<FileWarning />} title="The original file is missing" actions={retry}>
              <p>
                Outpost has a record of this document, but its file is no longer{" "}
                {locationName ? `on “${locationName}”` : "in its storage location"}. It may have been moved or deleted outside Outpost.
              </p>
            </ViewerMessage>
          ) : (
            <ViewerMessage
              icon={<FileWarning />}
              title="This PDF could not be opened"
              actions={
                <>
                  {retry}
                  {download}
                </>
              }
            >
              <p>{phase.message}</p>
            </ViewerMessage>
          )}
        </div>
      )}

      {link ? (
        <div
          role="status"
          className={cn(floating, "absolute inset-x-3 bottom-3 mx-auto flex max-w-xl items-center gap-2 py-1.5 pr-1.5 pl-3.5")}
        >
          <p className="min-w-0 flex-1">
            <span className="text-ink-muted">This PDF links to </span>
            <span className="font-mono text-[0.8125rem] break-all">{link}</span>
          </p>
          <Button
            size="sm"
            onClick={async () => {
              if (await copyText(link)) toast.success("Address copied.");
              else toast.error("The address could not be copied. Select it and copy it by hand.");
            }}
          >
            <Copy /> Copy address
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setLink(null)}>
            <X />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
