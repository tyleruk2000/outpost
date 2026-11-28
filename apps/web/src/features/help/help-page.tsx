/**
 * Help: the guides to installing Outpost, looking after it and using it, grouped the way a
 * household thinks of them. Each guide is a page of docs/, word for word, read when the app
 * was built (guides.ts says which). The ones for people changing the code are folded away.
 * A field at the top narrows the sixty-odd guides to those whose name, sentence or everyday
 * words hold what is typed, so that "backup" is one guide away rather than a long scroll.
 */

import { GUIDE_INDEX } from "virtual:outpost-guides";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Disclosure, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { plural } from "@/lib/utils";
import { GUIDE_GROUPS, GUIDES, type Guide, type GuideGroupId, guidePath, HELP_SCREENS } from "./guides";

const titleOf = (guide: Guide) => GUIDE_INDEX[guide.slug]?.title ?? guide.slug;

/** One row of Help: a guide, or a screen that explains (guides.ts, `HELP_SCREENS`), opened where it is. */
interface Entry {
  key: string;
  to: string;
  title: string;
  about: string;
  keywords?: string;
  group: GuideGroupId;
}

const ENTRIES: Entry[] = [
  ...GUIDES.map((guide) => ({ ...guide, key: guide.slug, to: guidePath(guide.slug), title: titleOf(guide) })),
  ...HELP_SCREENS.map((screen) => ({ ...screen, key: screen.to })),
];

/** Whether a row holds every word typed. Help lists the rows that do, in its own order. */
function holds(typed: string, text: string): boolean {
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  return words.every((word) => lower.includes(word));
}

function GuideRows({ guides }: { guides: Entry[] }) {
  return (
    <Rows>
      {guides.map((guide) => (
        <li key={guide.key}>
          <Link
            to={guide.to}
            className="group -mx-2 flex items-center gap-4 rounded-control px-2 py-3.5 transition-colors duration-(--duration-fast) hover:bg-surface"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-title text-lead text-ink [overflow-wrap:anywhere] group-hover:text-primary">{guide.title}</span>
              <span className="mt-0.5 block text-small text-ink-muted">{guide.about}</span>
            </span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
          </Link>
        </li>
      ))}
    </Rows>
  );
}

export default function HelpPage() {
  const [typed, setTyped] = useState("");
  const words = typed.trim();
  const found = words ? ENTRIES.filter((entry) => holds(words, `${entry.title} ${entry.about} ${entry.keywords ?? ""}`)) : [];
  return (
    <Page width="reading">
      <PageHeader
        title="Help"
        description="How to install Outpost, look after it and use each part of it. These are the pages of Outpost’s documentation, word for word, and they read with no internet."
      />
      {/* biome-ignore lint/a11y/useSemanticElements: a form with role="search" is the search landmark every browser and screen reader knows */}
      <form role="search" className="relative -mt-2 max-w-[28rem]" onSubmit={(event) => event.preventDefault()}>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Find a guide, such as backup"
          aria-label="Find a guide"
          enterKeyHint="search"
          autoCapitalize="none"
          autoComplete="off"
          className="w-full pl-9"
        />
      </form>
      {words ? (
        <section aria-label="Guides found" className="mt-6">
          <p role="status" className="mb-2 text-small text-ink-muted">
            {found.length === 0 ? `No guide is about “${words}”.` : `${plural(found.length, "guide")} about “${words}”.`}
          </p>
          {found.length > 0 ? <GuideRows guides={found} /> : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-ink-muted">
            <Button size="sm" onClick={() => setTyped("")}>
              Show every guide
            </Button>
            {found.length === 0 ? <span>The quick search also finds each section inside the guides.</span> : null}
          </div>
        </section>
      ) : (
        GUIDE_GROUPS.map((group) => {
          const guides = ENTRIES.filter((entry) => entry.group === group.id);
          if (guides.length === 0) return null;
          if (group.closed) {
            return (
              <Disclosure key={group.id} className="mt-10" summary={`${group.title}: ${guides.length} pages`}>
                {group.about ? <p className="text-ink-muted">{group.about}</p> : null}
                <GuideRows guides={guides} />
              </Disclosure>
            );
          }
          return (
            <Section key={group.id} title={group.title}>
              <GuideRows guides={guides} />
            </Section>
          );
        })
      )}
      <p className="mt-10 text-small text-ink-muted">
        The guides are Outpost’s own pages, not part of your library: the library’s search does not hold them, and they are never sent to a
        model server. The quick search finds them, and each of their sections, by name.
      </p>
    </Page>
  );
}
