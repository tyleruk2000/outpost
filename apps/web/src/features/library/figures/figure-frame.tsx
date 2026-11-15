/**
 * The frame every figure in a document sits in: a diagram drawn from a ```mermaid block
 * or a signal figure drawn from a ```viz block.
 *
 * A figure is drawn at the size its lettering was made for. Where the column is a
 * little narrower it shrinks to fit; where the column is much narrower (a phone) it
 * keeps a readable size and scrolls sideways inside its own box, so the page never
 * does. "View larger" opens it on its own, with room to enlarge it further.
 */
import { Maximize2, Minus, Plus } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** How far a figure may shrink to fit its column before it scrolls instead. */
const SMALLEST = 0.82;
const STEPS = [1, 1.5, 2, 3];

export function Figure({
  title,
  caption,
  label,
  width,
  children,
  below,
}: {
  title?: string;
  caption?: string;
  /** What the figure is, for the scrolling region and the larger view: its title, or "Diagram". */
  label: string;
  /** The width, in CSS pixels, at which the drawing's lettering is the size it was made for. */
  width: number;
  /** The drawing. It fills the width it is given and keeps its proportions. */
  children: ReactNode;
  /** Anything that belongs under the figure, such as its source as text. */
  below?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const scale = STEPS[step] ?? 1.5;
  return (
    <figure className="doc-figure" style={{ "--figure-width": `${Math.round(width)}px` } as CSSProperties}>
      {title ? <figcaption className="doc-figure-title">{title}</figcaption> : null}
      <section
        className="doc-figure-scroll scroll-quiet"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
        tabIndex={0}
        aria-label={`Figure: ${label}`}
      >
        <div className="doc-figure-drawing" style={{ width: `clamp(${Math.round(width * SMALLEST)}px, 100%, ${Math.round(width)}px)` }}>
          {children}
        </div>
      </section>
      {caption ? <p className="doc-figure-caption">{caption}</p> : null}
      <div className="doc-figure-foot">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Maximize2 /> View larger
        </Button>
        {below}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent title={label} size="xl" className="max-h-[94dvh] max-w-[min(96vw,90rem)]">
            <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
              <Button variant="ghost" size="icon-sm" aria-label="Smaller" disabled={step === 0} onClick={() => setStep(step - 1)}>
                <Minus />
              </Button>
              <span className="tabular min-w-12 text-center text-small text-ink-muted" aria-live="polite">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Larger"
                disabled={step === STEPS.length - 1}
                onClick={() => setStep(step + 1)}
              >
                <Plus />
              </Button>
            </div>
            <section
              className="scroll-quiet min-h-0 flex-1 overflow-auto bg-page p-4"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
              tabIndex={0}
              aria-label={`${label}, enlarged`}
            >
              <div className="mx-auto" style={{ width: `${Math.round(width * scale)}px` }}>
                {children}
              </div>
            </section>
          </DialogContent>
        ) : null}
      </Dialog>
    </figure>
  );
}

/** What is shown when a figure cannot be drawn: the reason, and the text it was written as. */
export function FigureSource({ reason, source }: { reason: string; source: string }) {
  return (
    <div className="doc-figure-failed">
      <p>{reason}</p>
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  );
}
