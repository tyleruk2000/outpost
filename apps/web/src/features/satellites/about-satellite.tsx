/**
 * "About this satellite" under One satellite: a description from facts (./about.ts), its
 * website, SatNOGS's frequency-violator flag, and on a press only, Wikipedia's summary
 * of its article, credited and kept until discarded.
 */
import {
  type OmmElements,
  type SatelliteAbout,
  type SatelliteTransmitter,
  type SatelliteWikipedia,
  WIKIPEDIA_SOURCE,
} from "@outpost/shared";
import { BookOpen } from "lucide-react";
import { Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { aboutSentences } from "./about";
import { useDiscardWikipedia, useReadWikipedia } from "./data";

const link = "text-primary underline underline-offset-2";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Wikipedia({ noradId, article }: { noradId: number; article: SatelliteWikipedia | null }) {
  const read = useReadWikipedia();
  const discard = useDiscardWikipedia();
  const busy = read.isPending && read.variables === noradId;
  const failed = read.isError && read.variables === noradId ? errorMessage(read.error) : null;
  return (
    <div className="mt-5">
      <h3 className="text-body font-semibold text-ink">From Wikipedia</h3>
      {article ? (
        <>
          <p className="mt-1 text-small text-ink-muted">
            The article “{article.title}”{article.description ? ` (${article.description})` : ""},{" "}
            {article.foundBy === "name"
              ? `found under the name “${article.searchedFor}”.`
              : `the first fitting answer to a search for “${article.searchedFor}”: check it is about this satellite.`}
          </p>
          <p className="mt-2 max-w-prose text-body text-ink">{article.extract}</p>
          <p className="mt-2 text-small text-ink-muted">
            From{" "}
            <a className={link} href={article.url} target="_blank" rel="noreferrer">
              “{article.title}” on Wikipedia
            </a>
            , by its contributors, under{" "}
            <a className={link} href={WIKIPEDIA_SOURCE.licenceUrl} target="_blank" rel="noreferrer">
              {WIKIPEDIA_SOURCE.licence}
            </a>
            ; kept {formatDate(article.fetchedAt)}.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="secondary" disabled={discard.isPending} onClick={() => discard.mutate(noradId)}>
              Discard this article
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => read.mutate(noradId)}>
              {busy ? "Reading Wikipedia…" : "Fetch it again"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 max-w-prose text-small text-ink-muted">
            This asks English Wikipedia for the article under this satellite's names (or searches for it), and keeps its summary here so it
            can be read offline. Nothing is asked until you press.
          </p>
          <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => read.mutate(noradId)}>
            <BookOpen aria-hidden />
            {busy ? "Reading Wikipedia…" : "Read about it on Wikipedia"}
          </Button>
        </>
      )}
      {failed ? (
        <Notice tone="warning" className="mt-3">
          {failed}
        </Notice>
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
      <Wikipedia noradId={noradId} article={wikipedia} />
    </Section>
  );
}
