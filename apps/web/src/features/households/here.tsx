/**
 * "We're here now" for a portable household: where it is, from this device's location (asked
 * only on the press), a point chosen on the map, or a saved place. Nothing is fetched for
 * the new place: screens that use home say their figures are for the earlier one until a
 * person presses for new ones.
 */
import type { HereSource, HouseholdDto, HouseholdHereInput, MarkerDto } from "@outpost/shared";
import { Crosshair, LocateFixed, MapPin } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select, Skeleton } from "@/components/ui/misc";
import { useMarkers } from "@/features/maps/data";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { settle, useSetHere } from "./data";
import { positionName } from "./words";

const PlanMap = lazy(() => import("@/features/propagation/map/plan-map").then((module) => ({ default: module.PlanMap })));

export type HereChoice = HouseholdHereInput;

/** Where this device is, asked for now. Missing over plain http on another device: said in words. */
export function locateDevice(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator) || !window.isSecureContext) {
      reject(
        new Error(
          "Browsers only share a device's location with pages opened over HTTPS or on the device itself. Choose a point on the map or a saved place instead.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (fix) => resolve({ lat: fix.coords.latitude, lon: fix.coords.longitude }),
      () => reject(new Error("This device could not say where it is. Choose a point on the map or a saved place instead.")),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 },
    );
  });
}

/** The three ways of saying where a portable household is, with the place chosen so far. */
export function HereChooser({
  value,
  onChange,
  sources = ["device", "map", "place"],
  nameHint = "Such as the campsite or the car park, so the place says what it is.",
}: {
  value: HereChoice | null;
  onChange: (value: HereChoice | null) => void;
  /** The ways offered, in this order: a home place leaves out "a saved place", chosen from the list beside it. */
  sources?: readonly HereSource[];
  nameHint?: string;
}) {
  const [how, setHow] = useState<HereSource>(value?.source ?? sources[0] ?? "device");
  const [locating, setLocating] = useState(false);
  const markers = useMarkers();
  const places: MarkerDto[] = markers.data ?? [];

  const locate = () => {
    setLocating(true);
    locateDevice()
      .then((fix) => onChange({ ...fix, name: value?.source === "device" ? (value.name ?? null) : null, source: "device" }))
      .catch((error) => notify.error(errorMessage(error)))
      .finally(() => setLocating(false));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-small font-medium text-ink">Where it is from</span>
        <Segmented<HereSource>
          label="Where it is from"
          value={how}
          onChange={setHow}
          options={(
            [
              { value: "device", label: "This device", icon: <LocateFixed aria-hidden /> },
              { value: "map", label: "On the map", icon: <Crosshair aria-hidden /> },
              { value: "place", label: "A saved place", icon: <MapPin aria-hidden /> },
            ] as const
          ).filter((option) => sources.includes(option.value))}
          className="justify-self-start"
        />
      </div>
      {how === "device" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={locate} loading={locating}>
            <LocateFixed /> Use this device's location
          </Button>
          <span className="text-small text-ink-muted">The browser asks first. Nothing is sent anywhere else.</span>
        </div>
      ) : null}
      {how === "map" ? (
        <div className="grid gap-2">
          <p className="text-small text-ink-muted">Press the map where the household is.</p>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <PlanMap
              label="Map: press where the household is"
              places={places}
              onPress={({ position, place }) =>
                onChange({ lat: position.lat, lon: position.lon, name: place?.name ?? value?.name ?? null, source: "map" })
              }
              className="h-64 overflow-hidden rounded-panel border border-border"
            />
          </Suspense>
        </div>
      ) : null}
      {how === "place" ? (
        places.length === 0 ? (
          <p className="text-small text-ink-muted">No saved places yet. Save one on the Maps screen, or use this device or the map.</p>
        ) : (
          <Field label="Saved place">
            {(ids) => (
              <Select<string>
                {...ids}
                value={
                  value?.source === "place" ? places.find((place) => place.lat === value.lat && place.lon === value.lon)?.id : undefined
                }
                placeholder="Choose a place"
                onChange={(id) => {
                  const place = places.find((entry) => entry.id === id);
                  if (place) onChange({ lat: place.lat, lon: place.lon, name: place.name, source: "place" });
                }}
                options={places.map((place) => ({ value: place.id, label: place.name || "A saved place" }))}
              />
            )}
          </Field>
        )
      ) : null}
      {value ? (
        <div className="grid gap-3 border-t border-border pt-3">
          <p className="text-small text-ink" data-testid="here-chosen">
            Chosen: <span className="font-mono">{positionName({ ...value, name: null })}</span>
          </p>
          <Field label="Name for this place" optional hint={nameHint}>
            {(ids) => (
              <Input
                {...ids}
                value={value.name ?? ""}
                maxLength={120}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** The dialog behind each "We're here now" button. */
export function HereDialog({
  household,
  open,
  onOpenChange,
}: {
  household: HouseholdDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [choice, setChoice] = useState<HereChoice | null>(null);
  const save = useSetHere(household.id);
  const close = (next: boolean) => {
    if (!next) setChoice(null);
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={`Where ${household.name} is now`}
        description="Used by every screen that works from home. Forecasts, tides and passes for the new place are fetched only when you ask for them."
      >
        <DialogBody>
          <HereChooser value={choice} onChange={setChoice} />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!choice}
            loading={save.isPending}
            onClick={() => {
              if (!choice) return;
              settle(
                save,
                { ...choice, name: choice.name?.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(`${household.name} is here now.`);
                    close(false);
                  },
                  onError: (error) => notify.error(errorMessage(error)),
                },
              );
            }}
          >
            We're here now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
