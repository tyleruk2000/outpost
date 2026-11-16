/**
 * The places forecasts are kept for: chosen from the saved places on the map (the one
 * with the home icon is the home place), or this device's position where the browser
 * offers it. It offers it only on a secure page; the owner's plain http address is not
 * one, and the screen says so rather than offering a button that cannot work.
 */
import { MET_OFFICE_REGIONS, type MetOfficeRegionId, type WeatherPlace } from "@outpost/shared";
import { House, LocateFixed, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Badge, Select, Spinner } from "@/components/ui/misc";
import { useMarkers } from "@/features/maps/data";
import { errorMessage } from "@/lib/api";
import { useAddPlace, useRemovePlace, useUpdatePlace } from "./data";

const REGION_OPTIONS = MET_OFFICE_REGIONS.map((region) => ({ value: region.id, label: region.name }));

/** Whether this page may ask for the device's position, and if not, why. */
export function positionAvailable(): { ok: true } | { ok: false; reason: string } {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return {
      ok: false,
      reason:
        "Using this device's position needs a secure page (an https address). Settings has “HTTPS on your network”; until then, choose a saved place.",
    };
  }
  if (!("geolocation" in navigator)) return { ok: false, reason: "This browser does not offer the device's position." };
  return { ok: true };
}

export function PlacesView({ places }: { places: WeatherPlace[] }) {
  const update = useUpdatePlace();
  const remove = useRemovePlace();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<WeatherPlace | null>(null);
  return (
    <div>
      {places.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border" aria-label="Places">
          {places.map((place) => (
            <li key={place.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_16rem_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {place.name}
                  {place.isHome ? (
                    <Badge tone="primary">
                      <House aria-hidden />
                      Home
                    </Badge>
                  ) : null}
                </p>
                <p className="tabular font-mono text-small text-ink-muted">
                  {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
                  {place.markerId ? "" : " (not a saved place)"}
                </p>
              </div>
              <Select<MetOfficeRegionId | "none">
                aria-label={`Met Office warning region for ${place.name}`}
                value={place.region ?? "none"}
                onChange={(region) => update.mutate({ id: place.id, region: region === "none" ? null : region })}
                options={[{ value: "none", label: "No warning region chosen" }, ...REGION_OPTIONS]}
              />
              <Button variant="ghost" size="icon" aria-label={`Remove ${place.name}`} onClick={() => setRemoving(place)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 max-w-[70ch] text-small text-ink-muted">
        The Met Office words its warnings by region and Outpost cannot tell a region from a position, so choose each place's. The home place
        is the saved place with the home icon on the map.
      </p>
      <Button className="mt-4" onClick={() => setAdding(true)}>
        <Plus />
        Add a place
      </Button>
      {adding ? <AddPlaceDialog chosen={places} onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this place"}?`}
        description="Its forecast, flood data and averages kept on this server go with it. The saved place on the map stays."
        confirmLabel="Remove the place"
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </div>
  );
}

function AddPlaceDialog({ chosen, onClose }: { chosen: WeatherPlace[]; onClose: () => void }) {
  const markers = useMarkers();
  const add = useAddPlace();
  const [locating, setLocating] = useState(false);
  const position = positionAvailable();
  const taken = new Set(chosen.map((place) => place.markerId));
  const choices = (markers.data ?? []).filter((marker) => !taken.has(marker.id));
  const done = (name: string) => {
    toast.success(`${name} added. Press Update now to fetch its forecast.`);
    onClose();
  };
  const fail = (error: unknown) => toast.error(errorMessage(error));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Add a place"
        description="Forecasts and flood data are fetched for the places in the list when you press Update now."
      >
        <DialogBody className="grid gap-4">
          {markers.isPending ? (
            <Spinner label="Loading saved places" />
          ) : choices.length === 0 ? (
            <p className="text-body text-ink">
              {markers.data?.length ? "Every saved place is in the list already." : "There are no saved places yet."} Save one on the{" "}
              <Link to="/maps" className="text-primary underline underline-offset-2">
                map
              </Link>{" "}
              (give your home the home icon), and it appears here.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto border-y border-border" aria-label="Saved places">
              {choices.map((marker) => (
                <li key={marker.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 px-1 py-2 text-left hover:bg-surface-strong disabled:opacity-50"
                    disabled={add.isPending}
                    onClick={() => add.mutate({ markerId: marker.id }, { onSuccess: (place) => done(place.name), onError: fail })}
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">{marker.name || "Unnamed place"}</span>
                    {marker.icon === "home" ? <Badge tone="primary">Home</Badge> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {position.ok ? (
            <Button
              variant="secondary"
              loading={locating}
              onClick={() => {
                setLocating(true);
                navigator.geolocation.getCurrentPosition(
                  (found) => {
                    setLocating(false);
                    add.mutate(
                      { name: "This device's position", lat: found.coords.latitude, lon: found.coords.longitude },
                      { onSuccess: (place) => done(place.name), onError: fail },
                    );
                  },
                  (failure) => {
                    setLocating(false);
                    toast.error(
                      failure.code === failure.PERMISSION_DENIED
                        ? "The browser was not allowed to give the position."
                        : "The position could not be found.",
                    );
                  },
                  { timeout: 20_000, maximumAge: 600_000 },
                );
              }}
            >
              <LocateFixed />
              Use this device's position
            </Button>
          ) : (
            <Notice tone="info" icon={<LocateFixed />}>
              {position.reason}
            </Notice>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
