/**
 * "Print these": the repeaters the list shows (up to 200, in the list's order) made into
 * a PDF on this device, to save, print or keep in the library.
 */
import type { RepeaterListDto, RepeaterListResponse, RepeaterSort } from "@outpost/shared";
import { bandName, modeName } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import type { PrintPaper } from "@/features/print-kit";
import { SheetPdfActions, useSheetPdf } from "@/features/tools/kit/sheet-pdf";
import { api } from "@/lib/api";
import { useHeightUnit } from "@/lib/heights";
import { plural } from "@/lib/utils";
import { filterQuery, type LatLon, type RepeaterFilters } from "./data";
import { repeatersDocument } from "./print";
import { distanceText, withinText } from "./units";

const MOST = 200;

export function PrintDialog({
  open,
  onClose,
  filters,
  near,
  withinKm,
  sort,
  total,
  from,
  lists,
}: {
  open: boolean;
  onClose: () => void;
  filters: RepeaterFilters;
  near: LatLon | null;
  withinKm: number | null;
  sort: RepeaterSort;
  total: number;
  from: string;
  lists: Map<string, RepeaterListDto>;
}) {
  const unit = useHeightUnit();
  const query = filterQuery(filters, near, withinKm, sort);
  const rows = useQuery({
    queryKey: ["repeaters", "print", query],
    queryFn: ({ signal }) => api.get<RepeaterListResponse>("/api/repeaters", { ...query, limit: MOST, offset: 0 }, signal),
    enabled: open,
  });
  const data = rows.data;
  const make = useCallback(
    (paper: PrintPaper) =>
      repeatersDocument({
        repeaters: data?.repeaters ?? [],
        lists,
        order: near && sort === "near" ? `nearest to ${from} first` : sort === "frequency" ? "by frequency" : "by callsign",
        from: near ? from : null,
        filters: [
          filters.q.trim() ? `“${filters.q.trim()}”` : "",
          filters.band ? bandName(filters.band) : "",
          filters.mode ? modeName(filters.mode) : "",
          withinKm && near ? `within ${withinText(withinKm, unit)} of ${from}` : "",
          filters.hideOffAir ? "leaving out those not operational" : "",
        ].filter(Boolean),
        total: data?.total ?? 0,
        distance: (meters) => distanceText(meters, unit),
        made: new Date(),
        paper,
      }),
    [data, lists, near, sort, from, filters, withinKm, unit],
  );
  const made = useSheetPdf(open && data ? make : null, {
    title: "Repeaters",
    kind: "Repeater list",
    from: { what: "the repeaters list", path: "/radio/repeaters" },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Print these repeaters" size="md">
        <DialogBody className="grid gap-4">
          <p className="text-small text-ink-muted">
            A sheet of {plural(Math.min(total, MOST), "repeater")}
            {total > MOST ? ` (the first ${MOST} of ${total})` : ""}, as the list shows them: callsign, the frequency to listen on, shift,
            tone, place{near ? ", distance and bearing" : ""}, and the list each came from with the date of its data.
          </p>
          {rows.isError ? (
            <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />
          ) : !data ? (
            <Skeleton className="h-11 w-56" />
          ) : (
            <SheetPdfActions made={made} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
