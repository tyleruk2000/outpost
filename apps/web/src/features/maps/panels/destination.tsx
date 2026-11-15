/**
 * Where a map download is kept. Every download of map data (a region, its terrain,
 * place names) asks this the same way: each storage location with its free space, the
 * default marked, one that is disconnected or too small shown with the reason and not
 * selectable. The location the last download went to is offered first next time.
 */
import { formatBytes, type StorageLocation } from "@outpost/shared";
import { CircleAlert, HardDrive } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { LocationPicker } from "@/features/downloads/location-picker";
import { useStorage } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useStoredState } from "../hooks";
import { chooseLocation } from "../lib/location-choice";
import { STORAGE_KEYS } from "../lib/view";

const isRemembered = (value: unknown): value is string | null => value === null || typeof value === "string";

export interface Destination {
  storage: ReturnType<typeof useStorage>;
  locations: StorageLocation[];
  /** Where the download will go; undefined while loading, and when nowhere can take it. */
  locationId: string | undefined;
  location: StorageLocation | undefined;
  /** A location that was asked for but cannot take this download. */
  displaced: Pick<StorageLocation, "id" | "name" | "status"> | undefined;
  requiredBytes: number | null;
  choose: (id: string) => void;
  /** Call when a download starts, so the same location is offered next time. */
  remember: () => void;
}

/** The destination for a download of `requiredBytes` (null while its size is not known). */
export function useDestination(requiredBytes: number | null): Destination {
  const storage = useStorage();
  const [remembered, setRemembered] = useStoredState<string | null>(STORAGE_KEYS.downloadLocation, isRemembered, null);
  const [picked, setPicked] = useState<string>();
  const locations = useMemo(() => storage.data?.locations ?? [], [storage.data]);
  const choice = useMemo(
    () => chooseLocation(locations, requiredBytes, { picked, remembered }),
    [locations, requiredBytes, picked, remembered],
  );
  const location = locations.find((candidate) => candidate.id === choice.locationId);
  const remember = useCallback(() => {
    if (choice.locationId) setRemembered(choice.locationId);
  }, [choice.locationId, setRemembered]);
  return {
    storage,
    locations,
    locationId: choice.locationId,
    location,
    displaced: choice.displaced,
    requiredBytes,
    choose: setPicked,
    remember,
  };
}

/** The list to choose from, with its loading and failure states. */
export function DestinationPicker({
  destination,
  label = "Where to keep it",
  approximate,
  className,
}: {
  destination: Destination;
  label?: string;
  /** The size is an estimate, so the wording says "about". */
  approximate?: boolean;
  className?: string;
}) {
  const { storage, locations, locationId, displaced, requiredBytes } = destination;
  if (storage.isPending) return <Skeleton className={cn("h-14", className)} />;
  if (storage.isError) return <ErrorState error={storage.error} onRetry={() => storage.refetch()} />;
  return (
    <div className={cn("grid gap-2", className)}>
      <LocationPicker
        label={label}
        locations={locations}
        value={locationId}
        onChange={destination.choose}
        requiredBytes={requiredBytes}
        approximate={approximate}
      />
      {!locationId ? (
        <Notice tone="warning" icon={<CircleAlert />}>
          {locations.length === 0
            ? "There is no storage location to download to. Add one under Storage."
            : requiredBytes === null
              ? "No storage location is connected. Reconnect a drive, or add a location under Storage."
              : `No connected storage location has room for ${approximate ? "about " : ""}${formatBytes(requiredBytes)}. Free some space, connect a drive, or choose something smaller.`}
        </Notice>
      ) : displaced ? (
        <Notice tone="info">
          “{displaced.name}” {displaced.status === "available" ? "has too little room for this" : "is not connected"}, so “
          {destination.location?.name}” is chosen instead.
        </Notice>
      ) : null}
    </div>
  );
}

/**
 * One line saying where the download will go, for beside the button that starts it, so
 * the destination is in view at the moment of deciding however far the list has scrolled.
 */
export function DestinationLine({
  destination,
  onChange,
  className,
}: {
  destination: Destination;
  onChange?: () => void;
  className?: string;
}) {
  const { storage, location, locations } = destination;
  if (storage.isPending || storage.isError) return null;
  return (
    <p className={cn("flex min-w-0 items-center gap-2.5 text-small text-ink-muted", className)}>
      <HardDrive aria-hidden className="size-4 shrink-0" />
      {location ? (
        <span className="min-w-0 flex-1">
          Will be kept on <span className="font-medium text-ink">{location.name}</span>
          {location.freeBytes !== null ? <span className="tabular block">{formatBytes(location.freeBytes)} free there</span> : null}
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-danger">No storage location can take this</span>
      )}
      {/* Offered only when there is another place it could go. */}
      {onChange && location && locations.length > 1 ? (
        <Button variant="link" size="sm" onClick={onChange} className="shrink-0">
          Change
        </Button>
      ) : null}
    </p>
  );
}
