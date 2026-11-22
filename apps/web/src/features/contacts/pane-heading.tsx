/**
 * The heading of what is open beside the list (a contact, the form). On a wide screen the list's own
 * "Contacts" is the page's one level-1 heading and the contact's name comes under it; on a phone the
 * list is put away while a contact is open, and the contact's name is the page's heading.
 */
import { createContext, useContext, useEffect, useState } from "react";

/** Tailwind's `lg`, where the list and the pane sit side by side (contacts-page.tsx). */
const BESIDE = "(min-width: 64rem)";

export const PaneHeading = createContext<"h1" | "h2">("h1");

export function usePaneHeading(): "h1" | "h2" {
  return useContext(PaneHeading);
}

/** Whether the list and the pane are side by side just now. */
export function useSideBySide(): boolean {
  const [beside, setBeside] = useState(() => typeof window !== "undefined" && window.matchMedia?.(BESIDE).matches === true);
  useEffect(() => {
    const query = window.matchMedia?.(BESIDE);
    if (!query) return;
    const onChange = () => setBeside(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return beside;
}
