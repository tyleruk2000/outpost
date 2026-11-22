/**
 * "Suggested for where Home is", at the top of Explore: what to download for the country
 * Home is in, worldwide sources first and the UK's own as additions in the UK. Each row
 * says what it is and links to the screen that fetches it, or opens the catalogue's own
 * download for an encyclopedia. Nothing here asks anything of the internet.
 */
import type { CatalogEntryDto } from "@outpost/shared";
import { Check, ChevronRight, Download } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { HomeAsOf, useHome } from "@/features/households/home";
import { useCatalogue } from "@/features/layers/data";
import { useMapOverview, useMapRegions } from "@/features/maps/data";
import { NoHomePlace } from "@/features/maps/home-place";
import { type Suggestions, suggestionsFor } from "./suggestions";

export function useSuggestions(entries: CatalogEntryDto[]): { suggestions: Suggestions | null; pending: boolean } {
  const current = useHome();
  const countries = useCatalogue();
  const presets = useMapRegions(true);
  const overview = useMapOverview();
  const pending = current.isPending || countries.isPending || presets.isPending || overview.isPending;
  const suggestions = useMemo(
    () =>
      pending
        ? null
        : suggestionsFor({
            home: current.home,
            country: current.country,
            countries: countries.data?.countries,
            presets: presets.data?.groups.flatMap((group) => group.regions),
            overview: overview.data,
            entries,
          }),
    [pending, current.home, current.country, countries.data, presets.data, overview.data, entries],
  );
  return { suggestions, pending };
}

export function SuggestedForHome({
  suggestions,
  pending,
  onDownload,
}: {
  suggestions: Suggestions | null;
  pending: boolean;
  onDownload: (entry: CatalogEntryDto) => void;
}) {
  const { home } = useHome();
  if (pending) return <Skeleton className="mb-6 h-24" />;
  if (!suggestions) return null;
  if (suggestions.state === "no-home")
    return (
      <section aria-labelledby="suggested-title" className="mb-6">
        <h2 id="suggested-title" className="text-lead font-semibold text-ink">
          Suggested for where you live
        </h2>
        <p className="mt-1 text-small text-ink-muted">Explore suggests maps, place names and sources for the country Home is in.</p>
        <NoHomePlace className="mt-1" />
      </section>
    );
  if (suggestions.state === "no-country")
    return (
      <section aria-labelledby="suggested-title" className="mb-6">
        <h2 id="suggested-title" className="text-lead font-semibold text-ink">
          Suggested for where you live
        </h2>
        <p className="mt-1 text-small text-ink-muted">
          Home is not inside any country Outpost knows the outline of (it may be at sea), so nothing is suggested by country.
        </p>
      </section>
    );
  const base = suggestions.rows.filter((row) => !row.uk);
  const uk = suggestions.rows.filter((row) => row.uk);
  return (
    <section aria-labelledby="suggested-title" className="mb-8">
      <h2 id="suggested-title" className="text-lead font-semibold text-ink">
        Suggested for {suggestions.country.name}
      </h2>
      <p className="mt-1 max-w-[68ch] text-small text-ink-muted">
        For the country Home is in, by the outline of the country round it; near a border it may be the neighbour. Each opens the screen
        that fetches it, which shows the size first.
      </p>
      <HomeAsOf home={home} className="mt-1" />
      <Rows rows={base} onDownload={onDownload} label={`Suggested for ${suggestions.country.name}`} />
      {uk.length > 0 ? (
        <>
          <h3 className="mt-5 text-small font-semibold text-ink">Also in the United Kingdom</h3>
          <Rows rows={uk} onDownload={onDownload} label="UK sources" />
        </>
      ) : null}
    </section>
  );
}

function Rows({
  rows,
  onDownload,
  label,
}: {
  rows: Extract<Suggestions, { state: "ready" }>["rows"];
  onDownload: (entry: CatalogEntryDto) => void;
  label: string;
}) {
  return (
    <ul aria-label={label} className="mt-3 divide-y divide-border border-y border-border">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-x-6 gap-y-2 py-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">{row.title}</p>
            <p className="mt-0.5 max-w-[68ch] text-small text-ink-muted">{row.about}</p>
          </div>
          {row.done ? (
            <p className="flex shrink-0 items-center gap-1.5 text-small text-ink-muted">
              <Check aria-hidden className="size-4 text-success" /> Already here
            </p>
          ) : row.entry ? (
            <Button size="sm" variant="secondary" className="shrink-0 max-md:self-start" onClick={() => onDownload(row.entry!)}>
              <Download aria-hidden /> Download
            </Button>
          ) : row.to ? (
            <Link
              to={row.to}
              className="flex min-h-11 shrink-0 items-center gap-1 text-small font-medium text-primary underline-offset-2 hover:underline md:min-h-8"
            >
              Open <ChevronRight aria-hidden className="size-4" />
              <span className="sr-only">{row.title}</span>
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
