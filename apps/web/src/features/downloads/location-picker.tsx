import { formatBytes, type StorageLocation } from "@outpost/shared";
import { ChoiceList } from "./choice-list";

/**
 * The server keeps this much of every location free so a full disk never corrupts a
 * transfer. Mirrored here so a location is marked too small before the person picks it;
 * the server still has the last word when the transfer starts.
 */
export const SPACE_RESERVE_BYTES = 256 * 1024 * 1024;

export type LocationProblem = "disconnected" | "too_small" | null;

export function locationProblem(location: Pick<StorageLocation, "status" | "freeBytes">, requiredBytes: number | null): LocationProblem {
  if (location.status !== "available") return "disconnected";
  if (requiredBytes !== null && location.freeBytes !== null && location.freeBytes < requiredBytes + SPACE_RESERVE_BYTES) return "too_small";
  return null;
}

type PickerLocation = Pick<StorageLocation, "id" | "name" | "isDefault" | "status" | "freeBytes">;

/** The location to preselect: the default when it can take the file, otherwise the first that can. */
export function preferredLocation(locations: PickerLocation[], requiredBytes: number | null): string | undefined {
  const usable = locations.filter((location) => locationProblem(location, requiredBytes) === null);
  return (usable.find((location) => location.isDefault) ?? usable[0])?.id;
}

/**
 * Where a file should go. Every location is listed with its free space; one that is
 * disconnected or too small stays visible, says why, and cannot be chosen.
 */
export function LocationPicker({
  label,
  locations,
  value,
  onChange,
  requiredBytes,
  approximate,
}: {
  label: string;
  locations: PickerLocation[];
  value: string | undefined;
  onChange: (id: string) => void;
  /** Bytes the file needs; null when not known. */
  requiredBytes: number | null;
  /** The size is an estimate, so the wording says "about". */
  approximate?: boolean;
}) {
  return (
    <ChoiceList
      label={label}
      value={value}
      onChange={onChange}
      choices={locations.map((location) => {
        const problem = locationProblem(location, requiredBytes);
        return {
          value: location.id,
          title: location.name,
          detail:
            problem === "disconnected"
              ? "Not connected"
              : problem === "too_small"
                ? `Not enough room: this needs ${approximate ? "about " : ""}${formatBytes(requiredBytes)}`
                : location.isDefault
                  ? "Default for new downloads"
                  : undefined,
          trailing: location.status === "available" && location.freeBytes !== null ? `${formatBytes(location.freeBytes)} free` : undefined,
          disabled: problem !== null,
        };
      })}
    />
  );
}
