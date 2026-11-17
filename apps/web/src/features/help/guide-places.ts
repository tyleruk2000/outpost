/**
 * The guides as places the quick search can go to: each by its title and its everyday
 * words, and each of its sections by the section's words ("Installing and running
 * Outpost: Raspberry Pi 4 and 5"). They come after the screens, and only a few of them,
 * so that a screen's name still lands on the screen.
 *
 * The headings of every guide are in the guides' index, which is not part of the app's
 * first load: it is fetched the first time the quick search opens.
 *
 * Guides are Outpost's own pages, not the household's library, so they are not put in the
 * library's search index and are never sent to a model server.
 */

import type { GuideIndexEntry } from "virtual:outpost-guides";
import { BookMarked } from "lucide-react";
import { useEffect, useState } from "react";
import { everyPlace, matchesWords, type Place } from "@/components/find-places";
import { GUIDES, guidePath } from "./guides";

type Index = Record<string, GuideIndexEntry>;

/** At most this many guides and sections are offered for one search. */
export const GUIDE_PLACES_SHOWN = 6;

const help = { to: "/help", label: "Help" };

/** The address of a section of a guide: a guide drawn from Markdown carries its heading ids with "h-" before them. */
export function sectionPath(slug: string, id: string): string {
  const own = GUIDES.find((guide) => guide.slug === slug)?.own;
  return `${guidePath(slug)}#${own ? id : `h-${id}`}`;
}

/** The guides and sections that match what was typed, best first, leaving out any that is a screen of the navigation already. */
export function findGuides(typed: string, index: Index | null): Place[] {
  if (!index || !typed.trim()) return [];
  const screens = new Set(everyPlace.map((place) => place.to));
  const byName: Place[] = [];
  const sections: Place[] = [];
  const byWords: Place[] = [];
  for (const guide of GUIDES) {
    const entry = index[guide.slug];
    if (!entry) continue;
    const to = guidePath(guide.slug);
    if (!screens.has(to)) {
      const place: Place = { to, label: entry.title, icon: BookMarked, parent: help };
      if (matchesWords(entry.title, typed)) byName.push(place);
      else if (guide.keywords && matchesWords(`${entry.title} ${guide.keywords}`, typed)) byWords.push(place);
    }
    for (const [id, title] of entry.sections) {
      if (matchesWords(title, typed)) {
        sections.push({
          to: sectionPath(guide.slug, id),
          label: title,
          icon: BookMarked,
          parent: { to, label: entry.title },
          section: true,
        });
      }
    }
  }
  return [...byName, ...sections, ...byWords].slice(0, GUIDE_PLACES_SHOWN);
}

let loaded: Index | null = null;

/** The guides' index once it has been fetched; asked for when `wanted` first turns true. */
export function useGuideIndex(wanted: boolean): Index | null {
  const [index, setIndex] = useState(loaded);
  useEffect(() => {
    if (!wanted || index) return;
    let current = true;
    import("virtual:outpost-guides")
      .then((module) => {
        loaded = module.GUIDE_INDEX;
        if (current) setIndex(loaded);
      })
      // Out of reach of the server: the screens are still offered, the guides are not.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [wanted, index]);
  return index;
}
