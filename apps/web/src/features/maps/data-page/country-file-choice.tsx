/**
 * The one question a country file asks: once roads and places are read from it, keep it or
 * delete it. Nothing is chosen the first time; the last answer is chosen after that. A kept
 * file for the place is read again instead, with no download, and nothing is asked.
 */
import { formatBytes, type StorageLocation } from "@outpost/shared";
import { Disclosure, Notice } from "@/components/page";
import { ChoiceList } from "@/features/downloads/choice-list";
import { type Destination, DestinationPicker } from "../panels/destination";
import { AWAY_LINE, DELETE_TITLE, deleteDetail, FILE_EXPLAINER, KEEP_DETAIL, KEEP_TITLE, keptFileLine } from "./words";

/** The location to suggest for a kept country file: the last one used, else the connected one with the most room. */
export function suggestedFileLocation(locations: StorageLocation[], last: string | null): string | undefined {
  const usable = locations.filter((location) => location.status === "available");
  if (last && usable.some((location) => location.id === last)) return last;
  return [...usable].sort((a, b) => (b.freeBytes ?? 0) - (a.freeBytes ?? 0))[0]?.id;
}

export function CountryFileChoice({
  size,
  kept,
  value,
  onChange,
  firstTime,
  destination,
  headingLevel = 3,
}: {
  /** The country file's size, once checked. */
  size: number | null;
  /** A kept file for this place, read instead of a download. */
  kept: { dataDate: string | null; locationName: string | null } | null;
  value: boolean | undefined;
  onChange: (keep: boolean) => void;
  /** No choice made before: say why there is a second file at all. */
  firstTime: boolean;
  /** Where a kept file goes. */
  destination: Destination;
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  if (kept) {
    return (
      <Notice tone="info" title={keptFileLine(kept.dataDate)}>
        The country file kept{kept.locationName ? ` on ${kept.locationName}` : ""} is read for roads and places.
      </Notice>
    );
  }
  const sizeText = size === null ? null : formatBytes(size);
  return (
    <section className="grid gap-2" aria-labelledby="country-file-afterwards">
      <Heading id="country-file-afterwards" className="text-small font-semibold text-ink">
        The country file afterwards
      </Heading>
      {firstTime ? (
        <p className="max-w-[60ch] text-small text-ink-muted">{FILE_EXPLAINER(sizeText)}</p>
      ) : (
        <Disclosure summary="Why a separate file?">
          <p className="max-w-[60ch] text-ink-muted">{FILE_EXPLAINER(sizeText)}</p>
        </Disclosure>
      )}
      <ChoiceList
        label="The country file afterwards"
        value={value === undefined ? undefined : value ? "keep" : "delete"}
        onChange={(next) => onChange(next === "keep")}
        choices={[
          { value: "delete", title: DELETE_TITLE, detail: deleteDetail(sizeText), trailing: "Only roads and places kept" },
          { value: "keep", title: KEEP_TITLE, detail: KEEP_DETAIL, trailing: sizeText ? `${sizeText} kept` : undefined },
        ]}
      />
      {value === true ? (
        <div className="mt-2 grid gap-2">
          <Heading className="text-small font-semibold text-ink">Where to keep the file</Heading>
          <DestinationPicker destination={destination} label="Where to keep the file" />
          {destination.location && destination.location.kind !== "internal" ? (
            <p className="text-small text-ink-muted">{AWAY_LINE}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
