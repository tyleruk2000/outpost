/**
 * What can be done with a PDF Outpost has made, the same wherever one is made and in
 * the same words: Save as PDF, Add to library and, on a device that can, Share.
 *
 * "Save as PDF" is a plain link to the bytes, which is the only kind of download a
 * phone's browser will start (docs/encryption.md, "Printing from a phone", has what
 * each browser does with it). "Add to library" does not go through the device at all:
 * the bytes held in the page are sent to the server, so it works where a download does
 * not. "Share" hands the file to the device's own share sheet where there is one.
 *
 * `useMadePdf` holds what is going on; `PdfButtons` and `PdfStatus` draw it. A screen
 * with room for both together uses `PdfActions`; one that keeps its buttons in a header
 * puts the two parts where they belong.
 */
import { formatBytes } from "@outpost/shared";
import { Check, CircleAlert, Download, Files, LibraryBig, Share2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { notify } from "@/lib/notify";
import { printSupport } from "@/lib/printing";
import { cn, formatDate } from "@/lib/utils";
import {
  type AddOutcome,
  addMadePdf,
  CATEGORY_MAX,
  chooseMadeCategory,
  MADE_CATEGORY,
  type MadePdf,
  madeCategory,
  type SendUpload,
  watchMadeCategory,
} from "./made-pdf";

export type AddState = { status: "idle" } | { status: "adding"; progress: number } | AddOutcome;

export interface MadePdfHandle {
  pdf: MadePdf | null;
  /** An address for the bytes, for the link that saves them. Undefined until there is a file. */
  url: string | undefined;
  state: AddState;
  /** The category the next "Add to library" files under. */
  category: string;
  setCategory: (category: string) => void;
  add: () => void;
  /** Stops an upload that is on its way. */
  cancel: () => void;
  canShare: boolean;
  share: () => void;
}

const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();

/**
 * Holds one made PDF and what has become of it. A new file (the person changed the
 * page and made it again) starts afresh: an upload of the old one is stopped, and what
 * was said about the old one is taken down.
 */
export function useMadePdf(pdf: MadePdf | null, options: { send?: SendUpload } = {}): MadePdfHandle {
  const file = pdf?.file ?? null;
  const [state, setState] = useState<AddState>({ status: "idle" });
  const category = useSyncExternalStore(watchMadeCategory, madeCategory, madeCategory);
  const [url, setUrl] = useState<string>();
  const sending = useRef<AbortController | null>(null);
  const send = options.send;

  // biome-ignore lint/correctness/useExhaustiveDependencies: run when the file changes, which is what makes the old state stale
  useEffect(() => {
    setState({ status: "idle" });
    return () => {
      sending.current?.abort();
      sending.current = null;
    };
  }, [file]);

  // The address is given back when the file changes or the screen is left; the browser then lets the bytes go.
  useEffect(() => {
    if (!file) return;
    let address: string;
    try {
      address = URL.createObjectURL(file);
    } catch {
      // A browser that will not hand out an address has no link to save by. The library does not need one.
      return;
    }
    setUrl(address);
    return () => {
      URL.revokeObjectURL(address);
      setUrl(undefined);
    };
  }, [file]);

  // Leaving the page would cut the upload short; the browser asks first while one is under way.
  const adding = state.status === "adding";
  useEffect(() => {
    if (!adding) return;
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [adding]);

  const add = useCallback(() => {
    if (!pdf || sending.current) return;
    const stop = new AbortController();
    sending.current = stop;
    setState({ status: "adding", progress: 0 });
    void addMadePdf(pdf, {
      category,
      signal: stop.signal,
      send,
      onProgress: (progress) => {
        if (sending.current === stop) setState({ status: "adding", progress });
      },
    }).then((outcome) => {
      // An upload that was stopped because the file changed has nothing to say about the new file.
      if (sending.current !== stop) return;
      sending.current = null;
      setState(outcome);
    });
  }, [pdf, category, send]);

  const cancel = useCallback(() => {
    if (!sending.current) return;
    sending.current.abort();
    sending.current = null;
    setState({ status: "cancelled" });
  }, []);

  const setCategory = useCallback((next: string) => void chooseMadeCategory(next), []);

  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const share = useCallback(() => {
    if (!pdf) return;
    navigator.share({ files: [pdf.file], title: pdf.title }).catch((error: unknown) => {
      // Closing the share sheet without choosing is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        notify.error("This device would not share the file. Save it, or add it to the library, instead.");
      }
    });
  }, [pdf]);

  return { pdf, url, state, category, setCategory, add, cancel, canShare, share };
}

/**
 * Which button is the main one unless a screen says otherwise: saving, except where
 * Outpost was opened from a phone's Home Screen. There a link that saves a file has not
 * always done anything (docs/encryption.md, "Printing from a phone"), and the library
 * is the way that does not depend on the device.
 */
const usualLead = (): "save" | "library" => (printSupport().standalone ? "library" : "save");

/**
 * The three buttons. `lead` says which is the main one. `confirm` puts a question
 * before "Add to library" where what is in the PDF calls for one.
 */
export function PdfButtons({
  made,
  lead: asked,
  confirm,
  size,
}: {
  made: MadePdfHandle;
  lead?: "save" | "library" | "none";
  confirm?: { title: string; description: ReactNode };
  size?: "sm" | "md";
}) {
  const [asking, setAsking] = useState(false);
  const [usual] = useState(usualLead);
  const lead = asked ?? usual;
  const { pdf, url, state } = made;
  const adding = state.status === "adding";
  return (
    <>
      {pdf && url ? (
        <Button asChild size={size} variant={lead === "save" ? "primary" : "secondary"}>
          <a href={url} download={pdf.file.name}>
            <Download aria-hidden /> Save as PDF
          </a>
        </Button>
      ) : (
        <Button size={size} variant={lead === "save" ? "primary" : "secondary"} disabled>
          <Download aria-hidden /> Save as PDF
        </Button>
      )}
      <Button
        size={size}
        variant={lead === "library" ? "primary" : "secondary"}
        disabled={!pdf}
        loading={adding}
        onClick={() => (confirm ? setAsking(true) : made.add())}
      >
        {adding ? null : <LibraryBig aria-hidden />} Add to library
      </Button>
      {made.canShare ? (
        <Button size={size} onClick={made.share}>
          <Share2 aria-hidden /> Share
        </Button>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          title={confirm.title}
          description={confirm.description}
          confirmLabel="Add to library"
          onConfirm={() => {
            setAsking(false);
            made.add();
          }}
        />
      ) : null}
    </>
  );
}

const linkClass = "font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

function DocumentLink({ outcome }: { outcome: Extract<AddOutcome, { status: "added" | "duplicate" }> }) {
  return (
    <Link
      to={`/library/documents/${outcome.document.id}`}
      state={{ fromLibrary: true }}
      className={cn(linkClass, "[overflow-wrap:anywhere]")}
    >
      {outcome.document.title}
    </Link>
  );
}

const FAILURE_TITLE = {
  "no-room": "Not added: there is no room for it",
  "storage-away": "Not added: the library's storage is not connected",
  unreachable: "Not added: Outpost did not answer",
  refused: "Not added",
} as const;

/**
 * What each of the three does, said where the choice is made, with the way to change
 * where the library files it. Saving leaves a file on the device that Outpost never sees
 * again; adding keeps it in Outpost. Before this, people saved a map and later looked for
 * it in the library.
 */
function WhereItGoes({ made }: { made: MadePdfHandle }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(made.category);
  const id = useId();
  if (!editing) {
    return (
      <ul className="grid gap-1 text-small text-ink-muted">
        <li>
          “Save as PDF” puts <span className="text-ink [overflow-wrap:anywhere]">{made.pdf?.file.name}</span> on this device, where the
          browser keeps downloads. Outpost keeps no copy.
        </li>
        <li>
          “Add to library” files it under “{made.category}”: Outpost keeps it, where search and backups reach it.{" "}
          <button
            type="button"
            // Set in the line like a link, at least 24 px tall (44 px on a phone, where the negative margin keeps the lines from moving apart).
            className={cn(linkClass, "inline-flex min-h-6 items-center rounded-control align-baseline max-md:-my-2.5 max-md:min-h-11")}
            onClick={() => {
              setDraft(made.category);
              setEditing(true);
            }}
          >
            Change where
          </button>
        </li>
        {made.canShare ? <li>“Share” hands it to another app on this device, such as mail or messages.</li> : null}
      </ul>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // A form inside another screen's form must not send that one too.
    event.stopPropagation();
    made.setCategory(draft);
    setEditing(false);
  };
  return (
    <form className="grid gap-1.5" onSubmit={submit}>
      <label htmlFor={id} className="text-small font-medium text-ink">
        Category for PDFs made in Outpost
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CATEGORY_MAX}
          placeholder={MADE_CATEGORY}
          className="max-w-64 min-w-0 flex-1"
          autoFocus
        />
        <Button type="submit">Use this</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-small text-ink-muted">Remembered on this device. Leave it empty for “{MADE_CATEGORY}”.</p>
    </form>
  );
}

/** What has become of the PDF, in words: on its way, where it went, or why it did not go. */
export function PdfStatus({ made, className }: { made: MadePdfHandle; className?: string }) {
  const { state, pdf } = made;
  if (!pdf) return null;
  const size = formatBytes(pdf.file.size);
  return (
    <div className={cn("grid min-w-0 gap-2 text-small", className)} data-testid="pdf-status" data-state={state.status}>
      {state.status === "adding" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="status">
          <div className="grid min-w-40 flex-1 gap-1.5">
            {/* All bytes sent, no answer yet: the server is checking and filing the file. */}
            <Progress value={state.progress >= 1 ? null : state.progress} tone="lamp" label="Sending the PDF to the library" />
            <p className="tabular text-ink-muted">
              {state.progress >= 1
                ? "The library is checking and filing it."
                : `Sending ${size} to the library: ${Math.round(state.progress * 100)}%.`}
            </p>
          </div>
          <Button size="sm" onClick={made.cancel}>
            Stop
          </Button>
        </div>
      ) : state.status === "added" ? (
        <p className="flex items-start gap-2 text-ink" role="status">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          <span className="min-w-0">
            Added to the library under “{state.category}” as <DocumentLink outcome={state} />. It can be found by search once its text has
            been read, which takes a moment.
          </span>
        </p>
      ) : state.status === "duplicate" ? (
        <p className="flex items-start gap-2 text-ink" role="status">
          <Files aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <span className="min-w-0">
            Already in the library as <DocumentLink outcome={state} />, added on {formatDate(state.document.createdAt)}. Nothing was added
            again.
          </span>
        </p>
      ) : state.status === "cancelled" ? (
        <p className="text-ink" role="status">
          Stopped. Nothing was added to the library.
        </p>
      ) : state.status === "failed" ? (
        <Notice tone="danger" icon={<CircleAlert />} title={FAILURE_TITLE[state.failure]}>
          {state.message}{" "}
          {state.failure === "no-room" ? (
            <>
              The PDF is {size}. Make room, or send new files to another location, under{" "}
              <Link to="/storage" className={linkClass}>
                Storage
              </Link>
              . “Save as PDF” keeps it on this device meanwhile.
            </>
          ) : state.failure === "storage-away" ? (
            <>
              See{" "}
              <Link to="/storage" className={linkClass}>
                Storage
              </Link>
              . “Save as PDF” keeps it on this device meanwhile.
            </>
          ) : state.failure === "unreachable" ? (
            <>The PDF is still here: press “Add to library” to try again.</>
          ) : null}
        </Notice>
      ) : null}
      {/* Said before it is sent, and again when it did not go. Once it is in the library the line above has said where. */}
      {state.status === "adding" || state.status === "added" || state.status === "duplicate" ? null : <WhereItGoes made={made} />}
    </div>
  );
}

/** Buttons and status together, for a screen with room for both in one place. */
export function PdfActions({
  pdf,
  lead,
  confirm,
  send,
  children,
  className,
}: {
  pdf: MadePdf | null;
  lead?: "save" | "library" | "none";
  confirm?: { title: string; description: ReactNode };
  /** The request itself. Tests give their own. */
  send?: SendUpload;
  /** Other buttons that belong in the same row. */
  children?: ReactNode;
  className?: string;
}) {
  const made = useMadePdf(pdf, { send });
  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <PdfButtons made={made} lead={lead} confirm={confirm} />
        {children}
      </div>
      <PdfStatus made={made} />
    </div>
  );
}
