/**
 * The one way to show that something failed. The toast library reads every toast out
 * through one polite live region, so a screen reader waits for a pause before saying that
 * a save failed. `notify.error` shows the same toast and also writes the message to an
 * assertive live region (`ErrorAnnouncer`, mounted once beside the toasts), which is read
 * out at once. Successes and other news stay polite: use `toast` for those.
 */
import { useEffect, useRef } from "react";
import { type ExternalToast, toast } from "sonner";

let announce: ((text: string) => void) | null = null;

export const notify = {
  error(message: string, ...options: [ExternalToast?]): string | number {
    const description = options[0]?.description;
    announce?.(typeof description === "string" && description ? `${message} ${description}` : message);
    return toast.error(message, ...options);
  },
};

/** How long a message stays in the region: long enough to be read out, then the region is empty again. */
const KEPT_MS = 7000;

/**
 * The assertive live region `notify.error` writes to. Each message replaces the last as a
 * new line, so the same failure twice in a row is read out twice.
 */
export function ErrorAnnouncer() {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    let timer: number | undefined;
    const speak = (text: string) => {
      const line = document.createElement("p");
      line.textContent = text;
      element.replaceChildren(line);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => element.replaceChildren(), KEPT_MS);
    };
    announce = speak;
    return () => {
      window.clearTimeout(timer);
      if (announce === speak) announce = null;
    };
  }, []);
  return <div ref={region} aria-live="assertive" aria-atomic="true" className="sr-only" />;
}
