/**
 * The card for one reference record: what it is, where it comes from and how far it can
 * be trusted, with everything its source gives behind a disclosure. A historical record
 * says first that it is history, and which of the three kinds of record it is.
 */
import {
  type FeatureProvenance,
  HISTORICAL_RECORD_TYPE_LABELS,
  haversineMeters,
  initialBearingDeg,
  PROVENANCE_INFO,
  REFERENCE_LAYER_INFO,
  type ReferenceFeatureDetail,
  type ReferenceSourceInfo,
} from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ExternalLink, FileText, Route as RouteIcon, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { formatPosition } from "@/features/maps/lib/coords";
import { formatBearing, formatDistanceWithMiles } from "@/features/maps/lib/geo";
import { MapCard } from "@/features/maps/map-chrome";
import { Fact, mapCard } from "@/features/maps/ui";
import { errorMessage } from "@/lib/api";
import { cn, formatDate, plural } from "@/lib/utils";
import { AirportFrequencies } from "./airport-frequencies";
import { FoodFacts } from "./food-facts";
import { ProvenanceMark } from "./marks";

function SourceFacts({ source }: { source: ReferenceSourceInfo }) {
  return (
    <dl>
      <Fact label="Published by">{source.publisher}</Fact>
      {source.publishedAt ? <Fact label="Publication">{source.publishedAt}</Fact> : null}
      <Fact label="Retrieved">{formatDate(source.retrievedAt)}</Fact>
      <Fact label="Licence">
        {source.licenseUrl ? (
          <a href={source.licenseUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            {source.license}
          </a>
        ) : (
          source.license
        )}
      </Fact>
      <Fact label="Accuracy">{source.accuracy}</Fact>
      <Fact label="Pack">{source.packTitle || source.providerName}</Fact>
      {source.sourceUrl ? (
        <Fact label="Source">
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
          >
            {source.providerName} <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </Fact>
      ) : null}
    </dl>
  );
}

export function ProvenanceLine({ provenance, className }: { provenance: FeatureProvenance; className?: string }) {
  const info = PROVENANCE_INFO[provenance];
  return (
    <p className={className}>
      <span className="inline-flex items-center gap-1.5 text-small font-medium text-ink">
        <ProvenanceMark provenance={provenance} />
        {info.label}
      </span>
    </p>
  );
}

function Body({ feature }: { feature: ReferenceFeatureDetail }) {
  const layer = REFERENCE_LAYER_INFO[feature.layer];
  const h = feature.historical;
  const props = Object.entries(feature.props);
  return (
    <>
      <p className="mt-0.5 text-small text-ink-muted">
        {feature.kindLabel}
        {feature.food?.alsoKinds.length ? `, also ${feature.food.alsoKinds.join(" and ").toLowerCase()}` : ""}, in{" "}
        {layer.label.toLowerCase()}
        {feature.country ? `, ${feature.country}` : ""}
      </p>
      {/* An airport's frequencies come first: they are what its card is opened for, and on a phone there is room for little else. */}
      {feature.airportFrequencies ? <AirportFrequencies frequencies={feature.airportFrequencies} /> : null}
      <details className="mt-2">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <ProvenanceLine provenance={feature.provenance} />
        </summary>
        <p className="mt-0.5 text-small text-ink-muted">{PROVENANCE_INFO[feature.provenance].about}</p>
      </details>
      {h ? (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-small font-medium text-ink">{HISTORICAL_RECORD_TYPE_LABELS[h.recordType]}</p>
          <p className="text-small text-ink-muted">What a document recorded, for {h.period}. It says nothing about this place today.</p>
          <dl className="mt-1">
            <Fact label="Document">{h.documentTitle}</Fact>
            {h.documentPublisher ? <Fact label="Publisher">{h.documentPublisher}</Fact> : null}
            {h.documentDate ? <Fact label="Dated">{h.documentDate}</Fact> : null}
            {h.archiveRef ? <Fact label="Archive reference">{h.archiveRef}</Fact> : null}
            {h.classification ? <Fact label="Classification">{h.classification}</Fact> : null}
            {h.targetCategory ? <Fact label="Category in the document">{h.targetCategory}</Fact> : null}
            <Fact label="Evidence">{h.evidenceQuality}</Fact>
            <Fact label="Placed">{h.geographicPrecision}</Fact>
            {h.locationText ? <Fact label="Place as written">{h.locationText}</Fact> : null}
          </dl>
          {h.citations.length > 0 ? <p className="mt-1 text-small text-ink-muted">Cited: {h.citations.join("; ")}</p> : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {h.libraryDocument ? (
              <Link
                to={`/library/documents/${h.libraryDocument.id}`}
                className="inline-flex items-center gap-1 text-small text-primary underline underline-offset-2"
              >
                <FileText aria-hidden className="size-3.5" /> Open {h.libraryDocument.title}
              </Link>
            ) : null}
            {h.documentUrl ? (
              <a
                href={h.documentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-small text-primary underline underline-offset-2"
              >
                <ExternalLink aria-hidden className="size-3.5" /> The document at its archive
              </a>
            ) : null}
          </div>
          {h.notes ? <p className="mt-1 text-small text-ink-muted">{h.notes}</p> : null}
        </div>
      ) : null}
      {feature.lat !== null && feature.lon !== null ? (
        <p className="tabular mt-2 font-mono text-[0.8125rem] text-ink">{formatPosition(feature.lat, feature.lon, "decimal").text}</p>
      ) : (
        <p className="mt-2 text-small text-ink-muted">Its place is not documented, so it is not on the map.</p>
      )}
      {feature.food ? <FoodFacts food={feature.food} source={feature.source} /> : null}
      <p className="mt-2 border-t border-border pt-2 text-small text-ink-muted">
        {feature.source.providerName}, {feature.source.license}, fetched {formatDate(feature.source.retrievedAt)}.{" "}
        {feature.source.sourceUrl ? (
          <a
            href={feature.source.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
          >
            The record at its source <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </p>
      <details className="mt-1 border-t border-border pt-2">
        <summary className="cursor-pointer text-small font-medium text-ink">Source, dates, licence and accuracy</summary>
        <SourceFacts source={feature.source} />
      </details>
      {feature.alsoFrom.length > 0 ? (
        <details className="mt-2 border-t border-border pt-2">
          <summary className="cursor-pointer text-small font-medium text-ink">
            Also recorded by {feature.alsoFrom.map((source) => source.providerName).join(" and ")}
          </summary>
          {feature.alsoFrom.map((source) => (
            <div key={`${source.provider}:${source.sourceId}`} className="mt-1">
              <ProvenanceLine provenance={source.provenance} />
              <SourceFacts source={source} />
            </div>
          ))}
        </details>
      ) : null}
      {props.length > 0 ? (
        <details className="mt-2 border-t border-border pt-2">
          <summary className="cursor-pointer text-small font-medium text-ink">Everything the source gives</summary>
          <dl className="mt-1">
            {props.map(([key, value]) => (
              <Fact key={key} label={key} mono>
                {value}
              </Fact>
            ))}
          </dl>
        </details>
      ) : null}
    </>
  );
}

/** Where a record is measured from (the household's home), and the way there. */
export interface CardWayThere {
  from: { name: string; lat: number; lon: number } | null;
  onDirections: (to: { name: string; lat: number; lon: number }) => void;
}

export function FeatureCard({
  query,
  alsoHere,
  onOpen,
  onClose,
  way,
}: {
  query: UseQueryResult<ReferenceFeatureDetail>;
  /** Other areas that contain the place pressed. */
  alsoHere: Array<{ id: number; name: string; kindLabel: string; provenance: FeatureProvenance }>;
  onOpen: (id: number) => void;
  onClose: () => void;
  way?: CardWayThere;
}) {
  if (query.isPending) {
    return (
      <MapCard title="Record" onClose={onClose} closeLabel="Close this record">
        <div className="mt-2 grid gap-2" aria-busy>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
          <span className="sr-only">Loading the record</span>
        </div>
      </MapCard>
    );
  }
  if (query.isError || !query.data) {
    return (
      <MapCard title="Record" onClose={onClose} closeLabel="Close this record">
        <p className="mt-1 text-small text-danger">{errorMessage(query.error)}</p>
      </MapCard>
    );
  }
  return <RecordCard feature={query.data} alsoHere={alsoHere} onOpen={onOpen} onClose={onClose} way={way} />;
}

/** The layers of places a person goes to, rather than areas, lines or history. */
const GO_TO_LAYERS = new Set<string>(["hospitals", "emergency", "shelters", "food", "airports", "towns"]);

/** "2.4 km NE of Home" and Directions, for a record that is a point a person could go to (not a historical one). */
function WayThere({ feature, way }: { feature: ReferenceFeatureDetail; way: CardWayThere }) {
  if (feature.lat === null || feature.lon === null || feature.historical || !GO_TO_LAYERS.has(feature.layer)) return null;
  const at = { lat: feature.lat, lon: feature.lon };
  const name = feature.name || feature.kindLabel;
  const from = way.from;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      {from ? (
        <p className="tabular min-w-0 flex-1 text-small text-ink">
          {`${formatDistanceWithMiles(haversineMeters(from.lat, from.lon, at.lat, at.lon))} ${formatBearing(initialBearingDeg(from, at)).replace(/^\d+° /, "")} of ${from.name}, in a straight line`}
        </p>
      ) : null}
      <Button size="sm" variant="primary" onClick={() => way.onDirections({ name, ...at })} className="max-md:h-11 md:pointer-coarse:h-11">
        <RouteIcon aria-hidden /> Directions
      </Button>
    </div>
  );
}

function RecordCard({
  feature,
  alsoHere,
  onOpen,
  onClose,
  way,
}: {
  feature: ReferenceFeatureDetail;
  alsoHere: Array<{ id: number; name: string; kindLabel: string; provenance: FeatureProvenance }>;
  onOpen: (id: number) => void;
  onClose: () => void;
  way?: CardWayThere;
}) {
  const [folded, setFolded] = useState(false);
  const name = feature.name || feature.kindLabel;
  // An airport's card is long; as the repeater's card does, it folds to one line to give the map back.
  const listed = feature.airportFrequencies?.list.length ?? 0;
  if (folded) {
    return (
      <section aria-label={`${name}: radio frequencies`} className={cn(mapCard, "py-1.5")}>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate font-title text-body font-semibold text-ink">{name}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Show the details" aria-expanded={false} onClick={() => setFolded(false)}>
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close this record" onClick={onClose} className="-mr-1.5 max-w-none">
            <X />
          </Button>
        </div>
        <p className="tabular text-small text-ink-muted">{plural(listed, "radio frequency", "radio frequencies")}</p>
      </section>
    );
  }
  return (
    <MapCard
      title={<span className="font-title">{name}</span>}
      onClose={onClose}
      closeLabel="Close this record"
      action={
        listed > 0 ? (
          <Button variant="ghost" size="icon-sm" aria-label="Show less" aria-expanded onClick={() => setFolded(true)} className="-mt-1">
            <ChevronDown />
          </Button>
        ) : undefined
      }
    >
      <Body feature={feature} />
      {way ? <WayThere feature={feature} way={way} /> : null}
      {alsoHere.length > 0 ? (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-small font-medium text-ink">Also here</p>
          <ul className="mt-1 divide-y divide-border">
            {alsoHere.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onOpen(entry.id)}
                  className="flex min-h-11 w-full items-center gap-2 text-left text-small text-ink hover:text-primary"
                >
                  <ProvenanceMark provenance={entry.provenance} />
                  <span className="min-w-0 flex-1 truncate">{entry.name || entry.kindLabel}</span>
                  <span className="shrink-0 text-ink-muted">{entry.kindLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </MapCard>
  );
}
