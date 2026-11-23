/**
 * Map data on the Storage screen: each kind by what it is for (maps to look at, hills and
 * heights, place names, places to find, roads for routes, country files), where it is, how many
 * and how large, each leading to its part of Map data, where it is moved, updated and removed.
 */
import { formatBytes } from "@outpost/shared";
import { Link } from "react-router";
import { ErrorState, Section } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { useMapData } from "@/features/maps/data-page/use-map-data";
import { staleItems, staleLine, storageRows } from "@/features/maps/data-page/words";
import { plural } from "@/lib/utils";

const link = "text-primary underline decoration-1 underline-offset-2";

export function MapDataSection() {
  const data = useMapData();
  const rows = data.data ? storageRows(data.data) : [];
  const stale = data.data ? staleItems(data.data).length : 0;
  return (
    <Section
      id="map-data"
      title="Map data"
      description="What the maps keep, by what it is for. Moved, updated and removed under Map data."
      actions={
        <Link to="/maps/data" className={`inline-flex min-h-6 items-center text-small max-md:min-h-11 md:pointer-coarse:min-h-11 ${link}`}>
          Manage map data
        </Link>
      }
    >
      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !data.data ? (
        <div className="grid max-w-3xl gap-2" aria-busy>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : (
        <div className="grid max-w-3xl gap-3">
          <Table label="Map data by kind" stack>
            <TableHead>
              <Tr>
                <Th>Kind</Th>
                <Th>Where</Th>
                <Th numeric>Items</Th>
                <Th numeric>Size</Th>
              </Tr>
            </TableHead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.name}>
                  <Td label="Kind">
                    <Link to={`/maps/data#${row.jump}`} className={`inline-flex min-h-6 items-center ${link}`}>
                      {row.name}
                    </Link>
                  </Td>
                  <Td label="Where" className="text-ink-muted">
                    {row.where.length > 0 ? row.where.join(", ") : "None yet"}
                  </Td>
                  <Td label="Items" numeric className={row.count === 0 ? "text-ink-muted" : undefined}>
                    {row.count === 0 ? "—" : plural(row.count, "item")}
                  </Td>
                  <Td label="Size" numeric className={row.count === 0 ? "text-ink-muted" : "font-medium whitespace-nowrap"}>
                    {row.count === 0 ? "—" : formatBytes(row.bytes)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {stale > 0 ? (
            <p className="text-small text-ink-muted">
              {staleLine(stale)}{" "}
              <Link to="/maps/data" className={link}>
                Review updates under Map data
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}
