import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * A text box whose words are kept in the address (`?q=` and the like), so a find can be
 * shared or come back to.
 *
 * The box holds its own text and writes the address once typing pauses. A box whose value
 * was the address itself lost letters typed quickly: each change of address is drawn a
 * moment later, and a key pressed in that moment was overwritten by the address's older
 * text. When the address changes by other means (Clear the filters, Back), the box follows.
 *
 * Returns the text as typed, the text as it now stands in the address, and the setter.
 */
export function useAddressText(key: string, delay = 300): [text: string, written: string, setText: (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const inAddress = params.get(key) ?? "";
  const [text, setText] = useState(inAddress);
  const written = useRef(inAddress);

  useEffect(() => {
    if (inAddress === written.current) return;
    written.current = inAddress;
    setText(inAddress);
  }, [inAddress]);

  useEffect(() => {
    if (text === written.current) return;
    const timer = window.setTimeout(() => {
      written.current = text;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (text === "") next.delete(key);
          else next.set(key, text);
          return next;
        },
        { replace: true },
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [text, key, delay, setParams]);

  return [text, inAddress, setText];
}
