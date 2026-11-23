/**
 * A small map of the world to tap a country on, drawn from the outline that comes with Outpost
 * (/world/countries.json, Natural Earth): nothing is fetched from elsewhere. A tap names the point;
 * the server says which country it is in. The search field beside it is the way from a keyboard,
 * so the drawing itself is a pointer's shortcut.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Ring = number[][];
interface CountryShape {
  iso: string | null;
  rings: Ring[];
}

const WIDTH = 360;
const HEIGHT = 150;
/** Antarctica and the far north are left off: nothing there to add, and the map stays short. */
const NORTH = 84;
const SOUTH = -60;

const x = (lon: number) => ((lon + 180) / 360) * WIDTH;
const y = (lat: number) => ((NORTH - Math.max(SOUTH, Math.min(NORTH, lat))) / (NORTH - SOUTH)) * HEIGHT;

function pathOf(rings: Ring[]): string {
  return rings
    .map((ring) => `${ring.map(([lon, lat], index) => `${index === 0 ? "M" : "L"}${x(lon!).toFixed(1)} ${y(lat!).toFixed(1)}`).join("")}Z`)
    .join("");
}

export function WorldPick({
  onPick,
  chosen,
  className,
}: {
  onPick: (point: { lat: number; lon: number }) => void;
  /** Countries chosen already, drawn darker (two letters). */
  chosen?: string[];
  className?: string;
}) {
  const shapes = useQuery({
    queryKey: ["maps", "world-outline"],
    queryFn: async (): Promise<CountryShape[]> => {
      const response = await fetch("/world/countries.json");
      if (!response.ok) throw new Error("The outline of the world could not be read.");
      const data = (await response.json()) as {
        features: Array<{ properties: { iso: string | null }; geometry: { type: string; coordinates: unknown } }>;
      };
      return data.features.map((feature) => ({
        iso: feature.properties.iso,
        rings:
          feature.geometry.type === "Polygon"
            ? [(feature.geometry.coordinates as Ring[])[0]!]
            : (feature.geometry.coordinates as Ring[][]).map((polygon) => polygon[0]!),
      }));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [hover, setHover] = useState<string | null>(null);
  const paths = useMemo(
    () => (shapes.data ?? []).map((shape, index) => ({ key: `${shape.iso}-${index}`, iso: shape.iso, d: pathOf(shape.rings) })),
    [shapes.data],
  );
  const picked = new Set(chosen ?? []);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden
      data-testid="world-pick"
      className={cn("block h-auto w-full cursor-pointer touch-manipulation rounded-panel bg-surface", className)}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - box.left) / box.width) * WIDTH;
        const py = ((event.clientY - box.top) / box.height) * HEIGHT;
        onPick({ lon: (px / WIDTH) * 360 - 180, lat: NORTH - (py / HEIGHT) * (NORTH - SOUTH) });
      }}
    >
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          onPointerEnter={() => setHover(path.iso)}
          onPointerLeave={() => setHover((current) => (current === path.iso ? null : current))}
          className={cn(
            "stroke-page transition-colors duration-(--duration-fast) [stroke-width:0.3]",
            path.iso && picked.has(path.iso) ? "fill-primary" : path.iso && hover === path.iso ? "fill-ink-muted" : "fill-border-strong",
          )}
        />
      ))}
    </svg>
  );
}
