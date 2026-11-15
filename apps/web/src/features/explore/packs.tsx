/**
 * Packs: curated lists of catalogue entries that are usually wanted together.
 *
 * A pack answers "where do I start?". It is shown as a row with what it is for and
 * where it stands; fetching it opens a dialog that lists every item, lets any be left
 * out, asks where to keep them, and says what it will cost before anything starts.
 */
import type { CatalogEntryDto, CatalogPack, CatalogPackInstallResponse } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Download, LibraryBig, PackagePlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { LocationPicker, locationProblem, preferredLocation } from "../downloads/location-picker";
import { fetchSize, fetchSizeText, isUnderWay, packLine, packSummary, sizeText } from "./catalog";

/** Every pack as a row: what it is for, where it stands, and one button. */
export function PackList({ packs, entries }: { packs: CatalogPack[]; entries: CatalogEntryDto[] }) {
  const [open, setOpen] = useState<CatalogPack>();
  return (
    <>
      <ul className="divide-y divide-border border-y border-border">
        {packs.map((pack) => {
          const summary = packSummary(pack, entries);
          const complete = summary.missing.length === 0;
          return (
            <li key={pack.id} className="flex flex-col gap-x-6 gap-y-3 py-4 md:flex-row md:items-start">
              <div className="min-w-0 flex-1">
                <h3 className="font-title text-lead text-ink">{pack.name}</h3>
                <p className="mt-1 max-w-[68ch] text-small leading-relaxed text-ink">{pack.description}</p>
                <p className="tabular mt-1.5 text-small text-ink-muted">{packLine(summary)}</p>
              </div>
              <Button variant={complete ? "ghost" : "secondary"} onClick={() => setOpen(pack)} className="shrink-0 max-md:self-start">
                {complete ? <Check /> : <PackagePlus />}
                {complete ? "See what is in it" : summary.installed + summary.underWay > 0 ? "Get the rest" : "Get this pack"}
              </Button>
            </li>
          );
        })}
      </ul>
      <Dialog open={open !== undefined} onOpenChange={(next) => !next && setOpen(undefined)}>
        {open ? <PackDialog key={open.id} pack={open} entries={entries} onClose={() => setOpen(undefined)} /> : null}
      </Dialog>
    </>
  );
}

/** What to call the things that were added: sheets are single documents, books are kept whole. */
function addedNoun(added: Array<{ documentId?: string }>): string {
  const books = added.filter((item) => !item.documentId).length;
  return books === 0 ? "reference sheet" : books === added.length ? "book" : "item";
}

function stateOf(entry: CatalogEntryDto): string | null {
  if (entry.status === "installed") return "In your library";
  if (isUnderWay(entry)) return "On its way";
  return null;
}

function PackDialog({ pack, entries, onClose }: { pack: CatalogPack; entries: CatalogEntryDto[]; onClose(): void }) {
  const client = useQueryClient();
  const storage = useStorage();
  const summary = useMemo(() => packSummary(pack, entries), [pack, entries]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [chosenLocation, setChosenLocation] = useState<string>();
  const chosen = summary.missing.filter((entry) => !skipped.has(entry.id));
  const size = fetchSize(chosen);
  const requiredBytes = size.online > 0 && size.bytes > 0 ? size.bytes : null;

  const locations = storage.data?.locations ?? [];
  const usable = (id: string | undefined) => {
    const location = locations.find((item) => item.id === id);
    return location && locationProblem(location, requiredBytes) === null ? location : undefined;
  };
  const location = usable(chosenLocation) ?? usable(preferredLocation(locations, requiredBytes));

  const install = useMutation({
    mutationFn: () =>
      api.post<CatalogPackInstallResponse>(`/api/catalog/packs/${encodeURIComponent(pack.id)}/install`, {
        locationId: location?.id,
        entryIds: chosen.map((entry) => entry.id),
      }),
    onSettled: () => {
      for (const key of ["catalog", "downloads", "documents", "collections"]) void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const toggle = (id: string, on: boolean) =>
    setSkipped((before) => {
      const next = new Set(before);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  if (install.data) {
    const { queued, added, already, failed } = install.data;
    return (
      <DialogContent title={queued.length + added.length > 0 ? `${pack.name}: on its way` : `${pack.name}: nothing was started`}>
        <DialogBody className="space-y-3 text-small">
          {queued.length > 0 ? (
            <p>
              {plural(queued.length, "download")} {queued.length === 1 ? "has" : "have"} been queued. They are fetched in turn, carry on in
              the background, and continue from where they stopped if the connection drops.
            </p>
          ) : null}
          {added.length > 0 ? (
            <p>
              {plural(added.length, addedNoun(added))} that {added.length === 1 ? "comes" : "come"} with Outpost{" "}
              {added.length === 1 ? "is" : "are"} now in your library.
            </p>
          ) : null}
          {already > 0 ? <p className="text-ink-muted">{plural(already, "item")} had already been started or installed.</p> : null}
          {failed.length > 0 ? (
            <Notice tone="warning" title={`${plural(failed.length, "item")} could not be started`}>
              <ul className="mt-1 space-y-1">
                {failed.map((item) => (
                  <li key={item.entryId}>
                    <span className="font-medium">{item.name}</span>: {item.reason}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          {queued.length > 0 ? (
            <Button asChild variant="primary">
              <Link to="/downloads">
                <Download /> See the downloads
              </Link>
            </Button>
          ) : added.length > 0 && added.every((item) => !item.documentId) ? (
            // Books are kept whole, under Collections, rather than as a document per chapter.
            <Button asChild variant="primary">
              <Link to="/library?tab=collections">
                <LibraryBig /> Open your books
              </Link>
            </Button>
          ) : added.length > 0 ? (
            <Button asChild variant="primary">
              <Link to="/library">
                <LibraryBig /> Open your documents
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    );
  }

  const nothingLeft = summary.missing.length === 0;
  return (
    <DialogContent size="lg" title={pack.name} description={pack.description}>
      <DialogBody className="px-0 py-0">
        <ul className="divide-y divide-border">
          {summary.items.map((entry) => {
            const state = stateOf(entry);
            const id = `pack-${pack.id}-${entry.id}`;
            return (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3 max-md:py-3.5">
                {state ? (
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={!skipped.has(entry.id)}
                    disabled={install.isPending}
                    onCheckedChange={(on) => toggle(entry.id, on === true)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <label htmlFor={state ? undefined : id} className="block text-small font-medium text-ink">
                    {entry.name}
                  </label>
                  <p className="mt-0.5 text-micro text-ink-muted">{entry.publisher}</p>
                </div>
                <span className="tabular shrink-0 text-right text-small text-ink-muted">
                  {state ?? (entry.source.type === "bundled" ? "Included with Outpost" : sizeText(entry))}
                </span>
              </li>
            );
          })}
        </ul>
        {nothingLeft || size.online === 0 ? null : (
          <div className="border-t border-border px-5 py-4">
            {storage.isPending ? (
              <Skeleton className="h-16" />
            ) : storage.isError ? (
              <Notice tone="danger">{errorMessage(storage.error)}</Notice>
            ) : locations.length === 0 ? (
              <p className="text-small text-ink-muted">
                There is no storage location yet.{" "}
                <Link to="/storage" className="text-primary underline underline-offset-2">
                  Add one in Storage
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="mb-1.5 text-small font-semibold text-ink">Save to</p>
                <LocationPicker
                  label="Save to"
                  locations={locations}
                  value={location?.id}
                  onChange={setChosenLocation}
                  requiredBytes={requiredBytes}
                  approximate={size.approximate}
                />
                {!location ? (
                  <p className="mt-2 text-small text-danger">
                    No connected location has room for all of this. Leave some items out, or free some space.
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter className="justify-between">
        <p className="tabular min-w-0 flex-1 text-small text-ink-muted max-md:basis-full">
          {install.isError ? (
            <span className="text-danger">{errorMessage(install.error)}</span>
          ) : nothingLeft ? (
            "Everything in this pack is already in your library or on its way."
          ) : chosen.length === 0 ? (
            "Nothing is ticked."
          ) : (
            <>
              {plural(chosen.length, "item")}, {fetchSizeText(size)}.
              {size.online > 0 ? " Needs an internet connection." : " No connection needed."}
            </>
          )}
        </p>
        <Button variant="secondary" onClick={onClose}>
          {nothingLeft ? "Close" : "Cancel"}
        </Button>
        {nothingLeft ? null : (
          <Button
            variant="primary"
            disabled={chosen.length === 0 || (size.online > 0 && !location)}
            loading={install.isPending}
            onClick={() => install.mutate()}
          >
            <PackagePlus /> {size.online > 0 ? `Fetch ${plural(chosen.length, "item")}` : `Add ${plural(chosen.length, "item")}`}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
