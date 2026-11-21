import { CONTENT_KINDS, type ContentKind, formatBytes, type StorageLocation } from "@outpost/shared";
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

type PickerLocation = Pick<StorageLocation, "id" | "name" | "isDefault" | "status" | "freeBytes"> & {
  defaultFor?: StorageLocation["defaultFor"];
};

/**
 * The location to preselect: the one this kind of content is set to go to (Storage,
 * "Where new things go") when it can take the file, else the default, else the first that can.
 */
export function preferredLocation(locations: PickerLocation[], requiredBytes: number | null, kind?: ContentKind): string | undefined {
  const usable = locations.filter((location) => locationProblem(location, requiredBytes) === null);
  const own = kind ? usable.find((location) => location.defaultFor?.includes(kind)) : undefined;
  return (own ?? usable.find((location) => location.isDefault) ?? usable[0])?.id;
}

/** "Where new maps go", for the location a kind of content is set to go to. */
export function kindDefaultText(kind: ContentKind): string {
  const label = CONTENT_KINDS.find((entry) => entry.kind === kind)?.label ?? "downloads";
  return `Where new ${label.toLowerCase()} go`;
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
  kind,
}: {
  label: string;
  locations: PickerLocation[];
  value: string | undefined;
  onChange: (id: string) => void;
  /** Bytes the file needs; null when not known. */
  requiredBytes: number | null;
  /** The size is an estimate, so the wording says "about". */
  approximate?: boolean;
  /** The kind of content, so that the location it is set to go to is marked. */
  kind?: ContentKind;
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
                : kind && location.defaultFor?.includes(kind)
                  ? kindDefaultText(kind)
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
