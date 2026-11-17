/**
 * The card for one reference record: what it is, where it comes from and how far it can
 * be trusted, with everything its source gives behind a disclosure. A historical record
 * says first that it is history, and which of the three kinds of record it is.
 */
import {
  type FeatureProvenance,
  HISTORICAL_RECORD_TYPE_LABELS,
  PROVENANCE_INFO,
  REFERENCE_LAYER_INFO,
  type ReferenceFeatureDetail,
  type ReferenceSourceInfo,
} from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/misc";
import { formatPosition } from "@/features/maps/lib/coords";
import { MapCard } from "@/features/maps/map-chrome";
import { Fact } from "@/features/maps/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { AirportFrequencies } from "./airport-frequencies";
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
        {feature.kindLabel}, in {layer.label.toLowerCase()}
        {feature.country ? `, ${feature.country}` : ""}
      </p>
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
      {feature.airportFrequencies ? <AirportFrequencies frequencies={feature.airportFrequencies} /> : null}
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

export function FeatureCard({
  query,
  alsoHere,
  onOpen,
  onClose,
}: {
  query: UseQueryResult<ReferenceFeatureDetail>;
  /** Other areas that contain the place pressed. */
  alsoHere: Array<{ id: number; name: string; kindLabel: string; provenance: FeatureProvenance }>;
  onOpen: (id: number) => void;
  onClose: () => void;
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
  const feature = query.data;
  return (
    <MapCard
      title={<span className="font-title">{feature.name || feature.kindLabel}</span>}
      onClose={onClose}
      closeLabel="Close this record"
    >
      <Body feature={feature} />
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
