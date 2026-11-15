/** Which storage location a map download goes to when the person has not said otherwise. */
import type { StorageLocation } from "@outpost/shared";
import { locationProblem, preferredLocation } from "@/features/downloads/location-picker";

type Candidate = Pick<StorageLocation, "id" | "name" | "isDefault" | "status" | "freeBytes">;

export interface LocationChoice {
  /** Where the download will go; undefined when no location can take it. */
  locationId: string | undefined;
  /**
   * The location that was asked for (picked just now, or used last time) but cannot
   * take this download, so another was chosen in its place. The screen says so.
   */
  displaced: Candidate | undefined;
}

/**
 * The location for a download of `requiredBytes` (null while the size is not known):
 * the one picked in this visit, else the one the last download went to, else the
 * default, else the first with room. A location that is disconnected or too small is
 * never chosen, whoever asked for it.
 */
export function chooseLocation(
  locations: Candidate[],
  requiredBytes: number | null,
  wanted: { picked?: string; remembered?: string | null },
): LocationChoice {
  const usable = (id: string | null | undefined) => {
    const location = id ? locations.find((candidate) => candidate.id === id) : undefined;
    return location && locationProblem(location, requiredBytes) === null ? location : undefined;
  };
  const asked = wanted.picked ?? wanted.remembered ?? undefined;
  const direct = usable(wanted.picked) ?? usable(wanted.remembered);
  if (direct) return { locationId: direct.id, displaced: undefined };
  const locationId = preferredLocation(locations, requiredBytes);
  const displaced = locations.find((candidate) => candidate.id === asked);
  return { locationId, displaced: displaced && displaced.id !== locationId ? displaced : undefined };
}
