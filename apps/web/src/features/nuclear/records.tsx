/**
 * The historical records browser: every installed historical record, by period and then
 * name, each saying which of the three kinds of record it is (an actual historical
 * target list, a historical assessment of likely targets, or an author's speculation),
 * with its document and a way to open the document and the record on the map. History
 * only: nothing here is joined to modern infrastructure or to a scenario.
 */
import {
  HISTORICAL_RECORD_TYPE_LABELS,
  HISTORICAL_RECORD_TYPES,
  type HistoricalRecordsResponse,
  type HistoricalRecordType,
  type ReferenceLayerId,
} from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, MapPin } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select, Skeleton } from "@/components/ui/misc";
import { ProvenanceMark } from "@/features/layers/marks";
import type { LatLon } from "@/features/maps/lib/geo";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

const ALL = "all";
const PAGE = 50;

export const useHistoricalRecords = (recordType: HistoricalRecordType | null, limit: number) =>
  useQuery({
    // Under the layers' own keys, so that installing or removing a pack refreshes it.
    queryKey: ["layers", "historical", recordType ?? ALL, limit],
    queryFn: () =>
      api.get<HistoricalRecordsResponse>("/api/reference/historical", { ...(recordType ? { recordType } : {}), limit, offset: 0 }),
    placeholderData: keepPreviousData,
  });

export function RecordsBrowser({
  onOpen,
  onImport,
}: {
  /** Opens the record's card, and its place on the map when it has one. */
  onOpen: (id: number, layer: ReferenceLayerId, at: LatLon | null) => void;
  /** Goes to where historical records are imported. */
  onImport: () => void;
}) {
  const [recordType, setRecordType] = useState<HistoricalRecordType | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const records = useHistoricalRecords(recordType, limit);
  return (
    <section aria-label="Historical records" className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <p className="text-small text-ink-muted">
        What declassified and archived documents recorded, for the periods they cover. A record describes the past and says nothing about
        any place today. Listed by period, then by name.
      </p>
      <Select
        aria-label="Kind of record"
        value={recordType ?? ALL}
        onChange={(value) => {
          setRecordType(value === ALL ? null : (value as HistoricalRecordType));
          setLimit(PAGE);
        }}
        options={[
          { value: ALL, label: "Every kind of record" },
          ...HISTORICAL_RECORD_TYPES.map((type) => ({ value: type, label: HISTORICAL_RECORD_TYPE_LABELS[type] })),
        ]}
      />
      {records.isPending ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : records.isError ? (
        <ErrorState error={records.error} onRetry={() => records.refetch()} />
      ) : records.data.total === 0 ? (
        <EmptyState
          title={recordType ? "No records of this kind" : "No historical records installed"}
          action={<Button onClick={onImport}>Import historical records</Button>}
          compact
        >
          No dataset of historical records is cleared for Outpost to ship. Records you transcribe or obtain can be imported as a historical
          records file, each saying which kind of record it is and citing its document.
        </EmptyState>
      ) : (
        <>
          <p className="tabular text-small text-ink-muted">
            {formatNumber(records.data.total)} {records.data.total === 1 ? "record" : "records"}
          </p>
          <Rows className="border-y border-border" aria-label="Historical records found">
            {records.data.records.map((record) => {
              const at = record.lat !== null && record.lon !== null ? { lat: record.lat, lon: record.lon } : null;
              return (
                <li key={record.id} className="grid grid-cols-[minmax(0,1fr)] gap-1 py-3">
                  <div className="flex items-start gap-2">
                    <ProvenanceMark provenance={record.provenance} />
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-ink">{record.name || record.locationText || "Unnamed record"}</p>
                      <p className="text-small font-medium text-ink">{HISTORICAL_RECORD_TYPE_LABELS[record.recordType]}</p>
                      <p className="text-small text-ink-muted">
                        {record.period}. {record.documentTitle}
                        {record.documentDate ? `, ${record.documentDate}` : ""}.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pl-[26px]">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-1 text-small text-primary underline underline-offset-2"
                      onClick={() => onOpen(record.id, "historical", at)}
                    >
                      <MapPin aria-hidden className="size-3.5" />
                      {at ? "Open the record and its place" : "Open the record"}
                    </button>
                    {record.libraryDocument ? (
                      <Link
                        to={`/library/documents/${record.libraryDocument.id}`}
                        className="inline-flex min-h-11 items-center gap-1 text-small text-primary underline underline-offset-2"
                      >
                        <FileText aria-hidden className="size-3.5" /> The document in the library
                      </Link>
                    ) : null}
                    {record.documentUrl ? (
                      <a
                        href={record.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 text-small text-primary underline underline-offset-2"
                      >
                        <ExternalLink aria-hidden className="size-3.5" /> The document at its archive
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </Rows>
          {records.data.records.length < records.data.total ? (
            <div>
              <Button onClick={() => setLimit((current) => Math.min(current + PAGE, 200))} disabled={limit >= 200}>
                Show more
              </Button>
              {limit >= 200 ? (
                <p className="mt-1 text-small text-ink-muted">The first 200 are shown; choose a kind of record to narrow them.</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
