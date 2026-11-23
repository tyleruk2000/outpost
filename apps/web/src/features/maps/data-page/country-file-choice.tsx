/**
 * Where a kept source file goes: the last place one was kept, else the connected location with
 * the most room. The choice itself (keep it or delete it once read) is a two-line question in
 * Add a place, asked the first time and remembered.
 */
import type { StorageLocation } from "@outpost/shared";

export function suggestedFileLocation(locations: StorageLocation[], last: string | null): string | undefined {
  const usable = locations.filter((location) => location.status === "available");
  if (last && usable.some((location) => location.id === last)) return last;
  return [...usable].sort((a, b) => (b.freeBytes ?? 0) - (a.freeBytes ?? 0))[0]?.id;
}
