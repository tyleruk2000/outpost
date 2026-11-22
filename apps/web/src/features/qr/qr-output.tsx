/**
 * The code itself, what it holds in words, how large to print it, and every way to
 * take it away: a picture to save or copy, the browser's print, and a PDF to save, add
 * to the library or share.
 */
import { Check, Copy, FileImage, FileType, Printer } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Notice } from "@/components/page";
import { PrintNotice } from "@/components/print-notice";
import { Button } from "@/components/ui/button";
import { kitCanSetAll } from "@/features/contacts/kit-letters";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored } from "@/features/maps/lib/view";
import { type DrawLine, writeLettered } from "@/features/maps/print/lettering";
import { PAPERS } from "@/features/maps/print/paper";
import { useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { errorMessage } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { usePrinting } from "@/lib/printing";
import { cn, formatDate, plural } from "@/lib/utils";
import { type Described, printAdvice, type QrKind, sensitive } from "./content";
import type { QrCode } from "./encoder";
import { qrDocument, qrTexts } from "./kit-sheet";
import { CheckLine } from "./qr-forms";
import { codeFileName, extentOf, modulePath, pngBlob, svgFile } from "./render";
import { PRINTED_WIDTH_MM, qrSheet } from "./sheet";

/** Copying a picture needs the asynchronous clipboard, which a browser gives only to a secure (https) page. */
export function canCopyPicture(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}

/** Hands a file to the browser to save, from memory. Nothing is sent anywhere. */
function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function CodePicture({ code, label, className, copy }: { code: QrCode; label: string; className?: string; copy?: boolean }) {
  const extent = extentOf(code);
  return (
    <svg
      // The copy for the printer is the same picture again, and is not announced twice.
      {...(copy ? { "aria-hidden": true } : { role: "img", "aria-label": label, "data-testid": "qr-code" })}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      className={cn("block aspect-square w-full", className)}
      data-version={code.version}
    >
      <title>{label}</title>
      {/* Black on white in both themes: readers expect dark squares on a light ground. */}
      <rect width={extent} height={extent} fill="#fff" />
      <path d={modulePath(code)} fill="#000" />
    </svg>
  );
}

export function Contents({ described, className }: { described: Described; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-small", className)}>
      {described.lines.map((line) => (
        <div key={line.label} className="contents">
          <dt className="text-ink-muted">{line.label}</dt>
          <dd className="whitespace-pre-line text-ink [overflow-wrap:anywhere]">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const QUESTIONS: Record<"secret" | "people", { title: string; description: ReactNode }> = {
  secret: {
    title: "Put a Wi-Fi password in the library?",
    description: (
      <>
        <span className="block">
          The code on this sheet holds the network’s password, whether or not it is also written in words. In the library everyone who can
          reach Outpost on your network can open it, and it goes into every backup.
        </span>
        <span className="mt-2 block">Save it as a PDF on this device instead if only you should have it.</span>
      </>
    ),
  },
  people: {
    title: "Put someone’s contact details in the library?",
    description: (
      <>
        <span className="block">
          This sheet holds another person’s details. In the library everyone who can reach Outpost on your network can read it and find it
          by search, and it goes into every backup.
        </span>
        <span className="mt-2 block">It is a copy: it will not change when the contact does.</span>
      </>
    ),
  },
};

type Made = { pdf: MadePdf } | { error: string };

/** How long typing must pause before the sheet is made again: each one is drawn and written whole. */
const SHEET_AFTER_MS = 400;

interface Settled {
  code: QrCode;
  described: Described;
  day: Date;
  footer: string;
  /** The print kit's typeface has every letter of its words; otherwise the old writer makes it, drawing such words as pictures. */
  kit: boolean;
}

/**
 * The sheet as a PDF, made on this device once the code or its words have stopped
 * changing: laid out with the print kit (kit-sheet.ts), or by the old writer (sheet.ts)
 * where its words hold letters the kit's typeface lacks.
 */
function SheetPdf({ code, described, kind, draw }: { code: QrCode; described: Described; kind: QrKind; draw?: DrawLine }) {
  const [paper] = useState(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const [settled, setSettled] = useState<Settled | null>(null);
  const [lettered, setLettered] = useState<Made | null>(null);

  useEffect(() => {
    setSettled(null);
    const timer = setTimeout(() => {
      // Dated by the day, not the moment: the same code made twice in a day is the same file, and the library says it has it.
      const today = new Date();
      const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      const footer = `Made in Outpost on ${formatDate(day.getTime())}.`;
      setSettled({ code, described, day, footer, kit: kitCanSetAll(qrTexts(described, footer)) });
    }, SHEET_AFTER_MS);
    return () => clearTimeout(timer);
  }, [code, described]);

  const make = useCallback(() => qrDocument(settled!.code, settled!.described, paper, settled!.footer, settled!.day), [settled, paper]);
  const kitMade = useKitPdf(settled?.kit ? make : null, {
    title: settled?.described.title ?? described.title,
    kind: "QR code",
    from: { what: "the QR code maker", path: "/tools/qr" },
  });

  useEffect(() => {
    let live = true;
    setLettered(null);
    if (!settled || settled.kit) return;
    writeLettered([qrSheet(settled.code, settled.described, paper, settled.footer)], settled.described.title, settled.day, draw)
      .then((written) => ({
        pdf: madePdf(written.bytes, settled.described.title, "QR code", { what: "the QR code maker", path: "/tools/qr" }),
      }))
      .catch((error: unknown) => ({ error: errorMessage(error) }))
      .then((result) => {
        if (live) setLettered(result);
      });
    return () => {
      live = false;
    };
  }, [settled, paper, draw]);

  const made: Made | null = !settled
    ? null
    : settled.kit
      ? kitMade.status === "made"
        ? { pdf: kitMade.pdf }
        : kitMade.status === "failed"
          ? { error: kitMade.error }
          : null
      : lettered;

  const asks = sensitive(kind);
  return (
    <section aria-label="The sheet as a PDF" className="grid gap-3 border-t border-border pt-4" data-testid="qr-pdf">
      <div>
        <h3 className="text-body font-semibold text-ink">The sheet as a PDF</h3>
        <p className="mt-0.5 text-small text-ink-muted">
          One page of {PAPERS[paper].label}: the code {PRINTED_WIDTH_MM / 10} cm wide, with what it holds written under it. Made on this
          device.
        </p>
      </div>
      {made && "error" in made ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error} The code can still be saved as a picture or printed from the browser.
        </Notice>
      ) : (
        <PdfActions pdf={made && "pdf" in made ? made.pdf : null} lead="save" confirm={asks ? QUESTIONS[asks] : undefined} />
      )}
    </section>
  );
}

export function QrOutput({
  code,
  described,
  kind,
  passwordInWords,
  onPasswordInWords,
  draw,
}: {
  code: QrCode;
  described: Described;
  kind: QrKind;
  passwordInWords: boolean;
  onPasswordInWords: (value: boolean) => void;
  draw?: DrawLine;
}) {
  const printing = usePrinting();
  const [copied, setCopied] = useState<"picture" | "text" | null>(null);
  const bytes = new TextEncoder().encode(described.payload).length;
  const advice = printAdvice(code);
  const label = `QR code: ${described.heading}`;

  const copyPicture = async () => {
    if (!canCopyPicture()) {
      notify.error("A picture can be copied only at an HTTPS address. Save it as a file instead.");
      return;
    }
    try {
      const blob = await pngBlob(code);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied("picture");
    } catch (error) {
      notify.error(`The picture was not copied. ${errorMessage(error)}`);
    }
  };
  const copyContents = async () => {
    if (await copyText(described.payload)) setCopied("text");
    else notify.error("This browser would not copy the text.");
  };

  return (
    <div className="grid gap-5">
      <figure className="grid gap-3">
        <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-panel border border-border-strong">
          <CodePicture code={code} label={label} />
        </div>
        <figcaption className="grid gap-2">
          <p className="font-title text-lead text-ink [overflow-wrap:anywhere]">{described.heading}</p>
          <Contents described={described} />
          <p className="text-small text-ink-muted">{described.action}</p>
        </figcaption>
      </figure>

      {kind === "wifi" && described.lines.some((line) => line.label === "Password") ? (
        <CheckLine checked={passwordInWords} onChange={onPasswordInWords}>
          Write the password in words, here and on the printed sheet
        </CheckLine>
      ) : null}

      <p className="tabular text-small text-ink-muted">
        Version {code.version}, {code.size} × {code.size} squares, {plural(bytes, "byte")}. {advice.sentence}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            pngBlob(code).then(
              (blob) => saveFile(blob, codeFileName(described.title, "png")),
              (error: unknown) => notify.error(errorMessage(error)),
            )
          }
        >
          <FileImage aria-hidden /> Save as PNG
        </Button>
        <Button onClick={() => saveFile(new Blob([svgFile(code, label)], { type: "image/svg+xml" }), codeFileName(described.title, "svg"))}>
          <FileType aria-hidden /> Save as SVG
        </Button>
        {canCopyPicture() ? (
          <Button onClick={copyPicture}>{copied === "picture" ? <Check aria-hidden /> : <Copy aria-hidden />} Copy picture</Button>
        ) : null}
        <Button onClick={copyContents}>{copied === "text" ? <Check aria-hidden /> : <Copy aria-hidden />} Copy text</Button>
        {printing.canPrint ? (
          <Button onClick={printing.print}>
            <Printer aria-hidden /> Print
          </Button>
        ) : null}
      </div>
      {canCopyPicture() ? null : (
        <p className="text-small text-ink-muted">
          Copying the picture needs a secure (https) page, which this is not; “HTTPS on your network” in Settings gives one. Save it as PNG
          instead. “Copy text” copies what the code holds{kind === "wifi" ? ", password and all" : ""}.
        </p>
      )}
      <PrintNotice printing={printing} instead="Save the PDF below and print that, or save the code as a PNG." />

      <SheetPdf code={code} described={described} kind={kind} draw={draw} />

      {/* For the printer: the sheet alone, a child of the body. */}
      {createPortal(
        <div className="outpost-qr-print" aria-hidden>
          <div className="outpost-qr-sheet">
            <h1>{described.heading}</h1>
            <div className="outpost-qr-code">
              <CodePicture code={code} label={label} copy />
            </div>
            <Contents described={described} />
            <p>{described.action} Point the phone’s camera at the code.</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
