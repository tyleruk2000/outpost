/** Under the text of a page: the pages that link here, and the pages inside this one. */
import type { NoteRef } from "@outpost/shared";
import { Plus } from "lucide-react";
import { memo, type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/utils";
import { displayTitle } from "./notes-data";
import { PageIcon } from "./page-bits";

/** Rows shown before "Show all": a page with thousands of sub-pages should still open at once. */
const FIRST = 50;

export function PageList({ pages, noun }: { pages: readonly NoteRef[]; noun: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? pages : pages.slice(0, FIRST);
  return (
    <>
      <ul className="divide-y divide-border border-y border-border">
        {shown.map((page) => (
          <li key={page.id}>
            <Link to={`/notes/${page.id}`} className="group flex items-center gap-3 py-2.5 text-ink max-md:py-3">
              <PageIcon icon={page.icon} className="text-ink-muted" />
              <span className="min-w-0 flex-1 truncate font-title text-body decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
                {displayTitle(page.title)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pages.length > shown.length ? (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)} className="mt-1 -ml-2.5">
          Show all {plural(pages.length, noun)}
        </Button>
      ) : null}
    </>
  );
}

function FooterSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-small font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Memoised: it only changes when the lists do, not with every keystroke's save state. */
export const NoteFooter = memo(function NoteFooter({
  backlinks,
  subPages,
  canAddSubPage,
  onNewSubPage,
}: {
  backlinks: readonly NoteRef[];
  subPages: readonly NoteRef[];
  canAddSubPage: boolean;
  onNewSubPage(): void;
}) {
  if (backlinks.length === 0 && subPages.length === 0 && !canAddSubPage) return null;
  return (
    <footer className="pb-10 font-sans">
      {subPages.length > 0 ? (
        <FooterSection
          title="Sub-pages"
          action={
            canAddSubPage ? (
              <Button variant="ghost" size="sm" onClick={onNewSubPage} className="-mr-2.5">
                <Plus /> New sub-page
              </Button>
            ) : null
          }
        >
          <PageList pages={subPages} noun="sub-page" />
        </FooterSection>
      ) : canAddSubPage ? (
        // With nothing inside yet, the action alone says all there is to say.
        <div className="mt-9 border-t border-border pt-2">
          <Button variant="ghost" size="sm" onClick={onNewSubPage} className="-ml-2.5">
            <Plus /> New sub-page
          </Button>
        </div>
      ) : null}
      {backlinks.length > 0 ? (
        <FooterSection title="Linked from">
          <PageList pages={backlinks} noun="page" />
        </FooterSection>
      ) : null}
    </footer>
  );
});
