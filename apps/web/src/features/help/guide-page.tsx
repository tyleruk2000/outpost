/**
 * One guide, at /help/<slug>: a page of docs/ drawn by the library's Markdown reader, with
 * links to its sections at the top, links between guides kept inside Outpost, and every
 * command shown whole with a button that copies it. Its words are loaded only when it is
 * opened (guides-plugin.ts makes each guide a file of its own).
 *
 * No "Save as PDF" here: the PDF writer Outpost has (features/maps/print) sets a table's
 * rows as single lines of fixed-width type and has no block of code, so the long tables
 * and commands of a guide do not fit its page. The browser's own print gives a clean copy
 * instead (guide.css hides the navigation and the buttons).
 */

import { GUIDE_INDEX, GUIDE_LOADERS, type GuideIndexEntry } from "virtual:outpost-guides";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router";
import { Disclosure, ErrorState, Joined, JumpLinks, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { BookLinksContext, CodeBlockContext, MarkdownDocument } from "@/features/library/document-markdown";
import { CommandLine } from "@/features/setup/recommended-models";
import { formatDate } from "@/lib/utils";
import { GUIDES, type Guide, guidePath } from "./guides";
import "./guide.css";

const back = { to: "/help", label: "Help" };

/** With more sections than this, the links to them are folded under one line, so that a phone opens on the guide. */
const UNFOLDED_SECTIONS = 8;

/** Guides that are screens of their own, drawn here (guides.ts, `page`). */
const ownPages = new Map(GUIDES.flatMap((guide) => (guide.page ? [[guide.slug, lazy(guide.page)] as const] : [])));

/** Where a link to another guide leads: its page, at the heading it names. */
const guideLinks = {
  picture: () => null,
  chapter(chapter: number, anchor?: string) {
    const guide = GUIDES[chapter - 1];
    if (!guide) return null;
    const hash = anchor ? (guide.own ? `#${anchor}` : `#h-${anchor}`) : undefined;
    return { pathname: guidePath(guide.slug), ...(hash ? { hash } : {}) };
  },
};

const drawCode = (code: string) => <CommandLine command={code} className="guide-code" />;

function Loading() {
  return (
    <div aria-busy className="grid gap-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-6 h-5 w-1/2" />
      <Skeleton className="h-4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function Contents({ entry }: { entry: GuideIndexEntry }) {
  const items = entry.sections.filter(([, , depth]) => depth === 2).map(([id, title]) => ({ id: `h-${id}`, label: title }));
  if (items.length < 2) return null;
  if (items.length <= UNFOLDED_SECTIONS) return <JumpLinks label="On this page" items={items} className="guide-chrome" />;
  return (
    <Disclosure summary={`On this page: ${items.length} parts`} className="guide-chrome -mt-4 mb-6">
      <JumpLinks label="On this page" items={items} className="m-0" />
    </Disclosure>
  );
}

function MarkdownGuide({ guide, entry }: { guide: Guide; entry: GuideIndexEntry }) {
  const words = useQuery({
    queryKey: ["help", guide.slug],
    queryFn: async () => (await GUIDE_LOADERS[guide.slug]!()).default,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const changed = entry.changed ? formatDate(Date.parse(`${entry.changed}T12:00:00Z`)) : null;

  return (
    <Page width="reading" className="guide-print">
      <PageHeader
        back={back}
        title={entry.title}
        description={
          <>
            <span className="block">{guide.about}</span>
            <span className="mt-1 block text-small">
              <Joined
                parts={[
                  changed ? `Changed ${changed}` : null,
                  <span key="file" className="[overflow-wrap:anywhere]">
                    In the repository as docs/{guide.file}
                  </span>,
                ]}
              />
            </span>
          </>
        }
        actions={
          guide.opens ? (
            <Button asChild className="guide-chrome">
              <Link to={guide.opens.to}>{guide.opens.label}</Link>
            </Button>
          ) : undefined
        }
      />
      <Contents entry={entry} />
      {words.isPending ? (
        <Loading />
      ) : words.isError ? (
        <ErrorState error={words.error} onRetry={() => void words.refetch()} />
      ) : (
        <div className="guide-doc">
          <BookLinksContext value={guideLinks}>
            <CodeBlockContext value={drawCode}>
              <MarkdownDocument blocks={words.data} title={entry.title} empty="This guide has no text." />
            </CodeBlockContext>
          </BookLinksContext>
        </div>
      )}
    </Page>
  );
}

function NoGuide() {
  return (
    <Page width="reading">
      <PageHeader
        back={back}
        title="There is no guide at this address"
        description="It may have been renamed, or the address was typed with a mistake in it."
      />
      <Button variant="primary" asChild>
        <Link to="/help">See every guide</Link>
      </Button>
    </Page>
  );
}

export default function GuidePage() {
  const { slug = "" } = useParams();
  const guide = GUIDES.find((candidate) => candidate.slug === slug);
  const entry = GUIDE_INDEX[slug];
  if (!guide || !entry) return <NoGuide />;
  const Own = ownPages.get(slug);
  if (Own) {
    return (
      <Suspense fallback={<Page width="reading">{<Loading />}</Page>}>
        <Own />
      </Suspense>
    );
  }
  if (guide.own || !GUIDE_LOADERS[slug]) return <NoGuide />;
  // Keyed by the guide, so that a link from one guide to another starts the next one afresh.
  return <MarkdownGuide key={slug} guide={guide} entry={entry} />;
}
