/**
 * "About this satellite" under One satellite: a description from facts (./about.ts), its
 * website, SatNOGS's frequency-violator flag, a caution when CelesTrak and SatNOGS DB
 * name the number differently, and on a press only, Wikipedia's summary of its article:
 * from a Wikipedia copy on this Outpost when there is one, else from Wikipedia online.
 * The article says how it was matched to the satellite, is credited, and is kept until
 * discarded; a discarded title is not offered again.
 */
import {
  type OmmElements,
  type SatelliteAbout,
  type SatelliteTransmitter,
  type SatelliteWikipedia,
  WIKIPEDIA_SOURCE,
} from "@outpost/shared";
import { BookOpen, Globe } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { aboutSentences, namesDisagree } from "./about";
import { useDiscardWikipedia, useForgetDiscarded, useReadWikipedia, useSatellites } from "./data";

const link = "text-primary underline underline-offset-2";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** How the article was tied to the satellite, in words; a caution where nothing but a name ties it. */
export function matchWords(article: SatelliteWikipedia): string {
  const offline = article.archive !== null;
  switch (article.foundBy) {
    case "number":
    case "cospar": {
      const what = article.foundBy === "number" ? "catalogue number" : "international designator";
      const value = article.searchedFor.replace(/^(NORAD|COSPAR) /, "");
      return offline
        ? `Matched by its ${what}: the article's infobox gives ${value}, this satellite's.`
        : `Matched by its ${what}: Wikidata's entry${article.wikidataId ? ` ${article.wikidataId}` : ""} for ${value} links to this article.`;
    }
    case "series":
      return "This article is about the series the satellite belongs to, not about it alone: no article was found about it on its own.";
    case "search":
      return `The first fitting answer to a search for “${article.searchedFor}”, about a spacecraft, but nothing ties it to this satellite's number: check it is about this satellite.`;
    default:
      return `Found under the name “${article.searchedFor}”, about a spacecraft, but nothing ties it to this satellite's number: check it is about this satellite.`;
  }
}

function Credit({ article }: { article: SatelliteWikipedia }) {
  const licence = (
    <a className={link} href={WIKIPEDIA_SOURCE.licenceUrl} target="_blank" rel="noreferrer">
      {WIKIPEDIA_SOURCE.licence}
    </a>
  );
  if (article.archive) {
    const date = article.archive.date ? Date.parse(article.archive.date) : Number.NaN;
    return (
      <p className="mt-2 text-small text-ink-muted">
        From the Wikipedia copy on this Outpost ({article.archive.title}
        {Number.isFinite(date) ? `, ${formatDate(date)}` : ""}):{" "}
        <Link className={link} to={article.url}>
          read “{article.title}”
        </Link>
        , by Wikipedia's contributors, under {licence}.
      </p>
    );
  }
  return (
    <p className="mt-2 text-small text-ink-muted">
      From{" "}
      <a className={link} href={article.url} target="_blank" rel="noreferrer">
        “{article.title}” on Wikipedia
      </a>
      , by its contributors, under {licence}; kept {formatDate(article.fetchedAt)}.
    </p>
  );
}

function Wikipedia({ noradId, article, discarded }: { noradId: number; article: SatelliteWikipedia | null; discarded: string[] }) {
  const read = useReadWikipedia();
  const discard = useDiscardWikipedia();
  const forget = useForgetDiscarded();
  const heading = useRef<HTMLHeadingElement>(null);
  const readButton = useRef<HTMLButtonElement>(null);
  /** Where the keyboard goes when what was pressed is replaced: the article, or the button that reads one. */
  const focusNext = useRef<"article" | "button" | null>(null);
  const mine = read.variables?.noradId === noradId;
  const busy = read.isPending && mine;
  const error = read.isError && mine ? read.error : null;
  const offlineChecked = error instanceof ApiError && error.details?.offlineChecked === true;
  const nothing = error instanceof ApiError && error.code === "not_found";
  const shownTitle = article?.title ?? null;

  useEffect(() => {
    if (focusNext.current === "article" && shownTitle) heading.current?.focus();
    if (focusNext.current === "button" && !shownTitle) readButton.current?.focus();
    focusNext.current = null;
  }, [shownTitle]);

  const ask = (online?: boolean) => {
    focusNext.current = "article";
    read.mutate({ noradId, online });
  };

  return (
    <div className="mt-5">
      <h3 ref={heading} tabIndex={-1} className="text-body font-semibold text-ink focus:outline-none focus-visible:outline-2">
        From Wikipedia
      </h3>
      {article ? (
        <>
          <p className="mt-1 max-w-prose text-small text-ink-muted">
            “{article.title}”{article.description ? ` (${article.description})` : ""}. {matchWords(article)}
          </p>
          <p className="mt-2 max-w-prose whitespace-pre-line text-body text-ink">{article.extract}</p>
          <Credit article={article} />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              loading={discard.isPending}
              onClick={() => {
                focusNext.current = "button";
                discard.mutate(noradId);
              }}
            >
              Discard this article
            </Button>
            <Button variant="ghost" loading={busy} onClick={() => ask()}>
              Fetch it again
            </Button>
          </div>
          <p className="mt-2 text-small text-ink-muted">A discarded article is not offered for this satellite again.</p>
        </>
      ) : (
        <>
          <p className="mt-1 max-w-prose text-small text-ink-muted">
            This looks in a Wikipedia copy on this Outpost if there is one, and otherwise asks English Wikipedia online, matching the
            article to this satellite by its catalogue number. Its summary is kept here to read offline. Nothing is asked until you press.
          </p>
          <Button ref={readButton} className="mt-3" variant="secondary" loading={busy && !read.variables?.online} onClick={() => ask()}>
            <BookOpen aria-hidden />
            Read about it on Wikipedia
          </Button>
        </>
      )}
      {error ? (
        <Notice
          tone={nothing ? "info" : "warning"}
          className="mt-3"
          action={
            offlineChecked ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => ask(true)}>
                <Globe aria-hidden />
                Ask Wikipedia online
              </Button>
            ) : null
          }
        >
          {errorMessage(error)}
        </Notice>
      ) : null}
      {discarded.length > 0 && !article ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-small text-ink-muted">
            Discarded before, so not offered again: {discarded.map((title) => `“${title}”`).join(", ")}.
          </p>
          <Button variant="ghost" size="sm" loading={forget.isPending} onClick={() => forget.mutate(noradId)}>
            Offer {discarded.length === 1 ? "it" : "them"} again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AboutSatellite({
  noradId,
  about,
  elements,
  transmitters,
  wikipedia,
  detailsFetched,
}: {
  noradId: number;
  about: SatelliteAbout | null;
  elements: Pick<OmmElements, "MEAN_MOTION" | "ECCENTRICITY" | "INCLINATION">;
  /** This satellite's transmitters, as SatNOGS lists them. */
  transmitters: readonly SatelliteTransmitter[];
  wikipedia: SatelliteWikipedia | null;
  /** SatNOGS DB's satellite list has been fetched at least once. */
  detailsFetched: boolean;
}) {
  const data = useSatellites().data;
  const celestrakName = data?.satellites.find((satellite) => satellite.noradId === noradId)?.name ?? "";
  const discarded = (data?.wikipediaDiscarded ?? []).filter((row) => row.noradId === noradId).map((row) => row.title);
  const sentences = aboutSentences(about, elements, transmitters);
  return (
    <Section title="About this satellite" className="mt-6">
      <p className="max-w-prose text-body text-ink">{sentences.join(" ")}</p>
      {!about ? (
        <p className="mt-2 text-small text-ink-muted">
          {detailsFetched
            ? "SatNOGS DB does not list this satellite, so only its orbit is described."
            : "Its names, launch and countries come from SatNOGS DB with the next press of Get orbital elements."}
        </p>
      ) : null}
      {about && namesDisagree(celestrakName, about) ? (
        <Notice tone="warning" className="mt-3" title="The two lists name this number differently">
          CelesTrak calls NORAD {noradId} “{celestrakName}”; SatNOGS DB calls it “{about.name}”. One of them may have another satellite
          under this number, so check the frequencies and the article below before relying on them.
        </Notice>
      ) : null}
      {about?.website ? (
        <p className="mt-2 text-small text-ink">
          Its website:{" "}
          <a className={link} href={about.website} target="_blank" rel="noreferrer">
            {hostOf(about.website)}
          </a>
        </p>
      ) : null}
      {about?.frequencyViolator ? (
        <Notice tone="warning" className="mt-3" title="Flagged as a frequency violator">
          SatNOGS DB reports this satellite as transmitting on a frequency that is uncoordinated or was denied (frequency coordination is
          done by the IARU for amateur satellites).
        </Notice>
      ) : null}
      {about?.associated.length ? (
        <p className="mt-2 text-small text-ink-muted">SatNOGS DB links it with {about.associated.join(", ")}.</p>
      ) : null}
      <Wikipedia noradId={noradId} article={wikipedia} discarded={discarded} />
    </Section>
  );
}
