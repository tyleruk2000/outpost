import { useEffect, useState } from "react";

const QUERY = "(hover: none)";

/** True on devices without a hovering pointer: phones and tablets used by touch. */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const update = () => setTouch(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return touch;
}

/**
 * How much of the bottom of the window the on-screen keyboard covers, so that a bar can
 * sit on top of it. Zero when there is no keyboard or the browser cannot say.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
