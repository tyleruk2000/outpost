/**
 * Offline maps on the Storage screen: how much, where, and by place (a country, a drawn area,
 * the world's basics), each leading to Offline maps, the one place they are added, updated,
 * moved and removed.
 */
import { formatBytes } from "@outpost/shared";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { ErrorState, Section } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { useMapData } from "@/features/maps/data-page/use-map-data";
import { offlineSummary, placesIn, stalePlacesLine } from "@/features/maps/data-page/words";

const link = "text-primary underline decoration-1 underline-offset-2";

export function MapDataSection() {
  const data = useMapData();
  const places = data.data ? placesIn(data.data).filter((place) => place.sizeBytes > 0) : [];
  const stale = places.filter((place) => place.stale > 0).length;
  return (
    <Section
      id="map-data"
      title="Offline maps"
      description={data.data ? offlineSummary(data.data.summary) : "What the maps keep, by place."}
      actions={
        <Link
          to="/maps/data"
          className={`inline-flex min-h-6 items-center gap-1 text-small max-md:min-h-11 md:pointer-coarse:min-h-11 ${link}`}
        >
          Manage <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
    >
      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !data.data ? (
        <div className="grid max-w-3xl gap-2" aria-busy>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <p className="text-small text-ink-muted">
          No offline maps yet: the map draws coastlines and borders until a place is added.{" "}
          <Link to="/maps/data?add=1" className={link}>
            Add a place
          </Link>
        </p>
      ) : (
        <div className="grid max-w-3xl gap-3">
          <Table label="Offline maps by place" stack>
            <TableHead>
              <Tr>
                <Th>Place</Th>
                <Th>Where</Th>
                <Th numeric>Size</Th>
              </Tr>
            </TableHead>
            <tbody>
              {places.map((place) => (
                <Tr key={place.key}>
                  <Td label="Place">
                    <Link to="/maps/data" className={`inline-flex min-h-6 items-center ${link}`}>
                      {place.name}
                    </Link>
                  </Td>
                  <Td label="Where" className="text-ink-muted">
                    {place.locations.join(", ")}
                  </Td>
                  <Td label="Size" numeric className="font-medium whitespace-nowrap">
                    {formatBytes(place.sizeBytes)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {stale > 0 ? (
            <p className="text-small text-ink-muted">
              {stalePlacesLine(stale)}{" "}
              <Link to="/maps/data" className={link}>
                Check for updates under Offline maps
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}
