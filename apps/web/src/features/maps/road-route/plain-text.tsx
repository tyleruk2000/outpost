/**
 * The condensed plain text: the whole route in lines no wider than 48 characters, in a box
 * to copy from, with plain letters for anything that lacks accents ("Genève" as "Geneve").
 * Outpost prints none of it itself: it is for pasting into a message, a note or a small
 * printer of one's own.
 */
import { directionsAsPlainText, type RoadRouteResult } from "@outpost/shared";
import { Copy } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";

export const PLAIN_TEXT_WIDTH = 48;

export function PlainTextBox({ route, title }: { route: RoadRouteResult; title?: string }) {
  const asciiId = useId();
  const headingId = useId();
  const [ascii, setAscii] = useState(false);
  const text = useMemo(
    () => directionsAsPlainText(route, { width: PLAIN_TEXT_WIDTH, ascii, ...(title ? { title } : {}) }),
    [route, ascii, title],
  );
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h4 id={headingId} className="text-body font-semibold text-ink">
        Condensed plain text
      </h4>
      <p className="text-small text-ink-muted">
        The whole route in lines of at most {PLAIN_TEXT_WIDTH} characters, to copy into a message or a note, or onto a small printer of your
        own.
      </p>
      <div className="flex items-center gap-2.5">
        <Checkbox id={asciiId} checked={ascii} onCheckedChange={(checked) => setAscii(checked === true)} />
        <label htmlFor={asciiId} className="text-small text-ink">
          Plain letters only (ASCII): “Genève” becomes “Geneve”
        </label>
      </div>
      {/* Read only, scrolling inside itself: a narrow phone scrolls the box, never the page. */}
      <textarea
        readOnly
        wrap="off"
        spellCheck={false}
        aria-label="The route as plain text"
        data-testid="road-route-plain-text"
        rows={Math.min(24, text.split("\n").length)}
        value={text}
        className="w-full resize-y overflow-auto rounded-control border border-border bg-surface p-3 font-mono text-[0.8125rem] leading-snug text-ink"
        style={{ maxWidth: `calc(${PLAIN_TEXT_WIDTH}ch + 1.5rem + 2px)` }}
      />
      <Button
        className="justify-self-start"
        onClick={async () => {
          if (await copyText(text)) toast.success("Copied the route as plain text.");
          else notify.error("This browser would not copy it. Select the text in the box and copy it by hand.");
        }}
      >
        <Copy /> Copy
      </Button>
    </section>
  );
}
