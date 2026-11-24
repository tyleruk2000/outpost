/**
 * Distances on the repeater screens, in the units this browser writes heights in
 * (Settings › Units): kilometres where heights are in metres, miles where they are in
 * feet. A list read against a map of the same country should not change units halfway.
 */
import { useCallback } from "react";
import { formatDistance, formatMiles } from "@/features/maps/lib/geo";
import { type HeightUnit, useHeightUnit } from "@/lib/heights";

export const distanceText = (meters: number, unit: HeightUnit) => (unit === "ft" ? formatMiles(meters) : formatDistance(meters));

/** "9.29 km", or "5.77 mi" where heights are in feet. */
export function useDistanceText(): (meters: number) => string {
  const unit = useHeightUnit();
  return useCallback((meters: number) => distanceText(meters, unit), [unit]);
}

/** The "within" choices, in the units distances are written in: each is kilometres to the server. */
export function withinOptions(unit: HeightUnit): Array<{ value: string; label: string }> {
  if (unit === "ft") {
    return [
      { value: "8.04672", label: "5 mi" },
      { value: "16.09344", label: "10 mi" },
      { value: "40.2336", label: "25 mi" },
      { value: "80.4672", label: "50 mi" },
      { value: "160.9344", label: "100 mi" },
      { value: "321.8688", label: "200 mi" },
    ];
  }
  return ["10", "25", "50", "100", "200", "500"].map((km) => ({ value: km, label: `${km} km` }));
}

/** "25 km" or "25 mi" for a within distance kept in kilometres. */
export function withinText(km: number, unit: HeightUnit): string {
  return withinOptions(unit).find((option) => Number(option.value) === km)?.label ?? (unit === "ft" ? formatMiles(km * 1000) : `${km} km`);
}
