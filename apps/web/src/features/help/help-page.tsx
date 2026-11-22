/**
 * Help: the guides to installing Outpost, looking after it and using it, grouped the way a
 * household thinks of them. Each guide is a page of docs/, word for word, read when the app
 * was built (guides.ts says which). The ones for people changing the code are folded away.
 */

import { GUIDE_INDEX } from "virtual:outpost-guides";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Disclosure, Page, PageHeader, Rows, Section } from "@/components/page";
import { GUIDE_GROUPS, GUIDES, type Guide, guidePath } from "./guides";

function GuideRows({ guides }: { guides: Guide[] }) {
  return (
    <Rows>
      {guides.map((guide) => (
        <li key={guide.slug}>
          <Link
            to={guidePath(guide.slug)}
            className="group flex items-center gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-title text-lead text-ink [overflow-wrap:anywhere] group-hover:text-primary">
                {GUIDE_INDEX[guide.slug]?.title ?? guide.slug}
              </span>
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
  return (
    <Page width="reading">
      <PageHeader
        title="Help"
        description="How to install Outpost, look after it and use each part of it. These are the pages of Outpost’s documentation, word for word, and they read with no internet."
      />
      {GUIDE_GROUPS.map((group) => {
        const guides = GUIDES.filter((guide) => guide.group === group.id);
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
      })}
      <p className="mt-10 text-small text-ink-muted">
        The guides are Outpost’s own pages, not part of your library: the library’s search does not hold them, and they are never sent to a
        model server. The quick search finds them, and each of their sections, by name.
      </p>
    </Page>
  );
}
