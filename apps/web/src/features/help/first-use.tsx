/**
 * A line offering a guide's quick start, on the screens it is about, until it is read or
 * put away on this device. For the household members who did not set Outpost up and meet
 * a screen for the first time.
 */
import { BookOpen, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { guidePath } from "./guides";

const storeKey = (slug: string) => `outpost.firstUse.${slug}`;

function seen(slug: string): boolean {
  try {
    return localStorage.getItem(storeKey(slug)) === "done";
  } catch {
    return false;
  }
}

function setSeen(slug: string): void {
  try {
    localStorage.setItem(storeKey(slug), "done");
  } catch {
    // Without storage it is offered again next time, which does no harm.
  }
}

export function FirstUseGuide({ slug, words, className }: { slug: string; words: string; className?: string }) {
  const [hidden, setHidden] = useState(() => seen(slug));
  if (hidden) return null;
  const done = () => {
    setSeen(slug);
    setHidden(true);
  };
  return (
    <aside
      aria-label="Quick start"
      className={cn("flex items-start gap-3 rounded-control border border-border bg-surface px-3 py-2.5 text-small", className)}
    >
      <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
      <p className="min-w-0 flex-1 text-ink">
        {words}{" "}
        <Link
          to={guidePath(slug)}
          onClick={done}
          className="font-medium text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
        >
          Read the quick start
        </Link>
      </p>
      <Button variant="ghost" size="icon-sm" aria-label="Put the quick start away" className="-my-1 -mr-1 shrink-0" onClick={done}>
        <X />
      </Button>
    </aside>
  );
}
