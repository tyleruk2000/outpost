/**
 * A box that scrolls on its own (a wide table on a phone, a long list in a card), which the
 * keyboard can reach and scroll as well as a finger can (WCAG 2.1.1). It is a named region (a
 * `section` with a name), so a screen reader says what is in it when it takes focus. Use it only
 * where the box holds nothing that takes focus itself; a box of links or buttons is scrolled by
 * moving through them.
 */
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScrollBox({
  label,
  className,
  children,
  as: Tag = "section",
}: {
  /** What is in the box, as a screen reader will say it. */
  label: string;
  className?: string;
  children: ReactNode;
  /** `ul` or `ol` for a list that scrolls; it keeps its role and takes this name. */
  as?: ElementType;
}) {
  return (
    <Tag
      aria-label={label}
      tabIndex={0}
      className={cn("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", className)}
    >
      {children}
    </Tag>
  );
}
