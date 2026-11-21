/**
 * Lays pictures painted in the page over the map as one group of shading (see shades.ts), replacing what the group
 * showed before, and takes them off again when the screen goes.
 */
import { useEffect } from "react";
import type { MapEngine } from "./engine";
import { encodeShade, keepShade, releaseShade, type ShadeGroup, type ShadePicture } from "./shades";

export function useShades(engine: MapEngine | null, group: ShadeGroup, pictures: ShadePicture[], opacity: number): void {
  useEffect(() => {
    if (!engine) return;
    let current = true;
    let shown: string[] = [];
    void (async () => {
      const encoded = await Promise.all(pictures.map(encodeShade));
      if (!current) return;
      const shades = pictures.flatMap((picture, index) => {
        const png = encoded[index];
        return png ? [{ url: keepShade(png), coordinates: picture.coordinates, opacity }] : [];
      });
      shown = shades.map((shade) => shade.url);
      engine.setShades(group, shades);
    })();
    return () => {
      current = false;
      // Replaced by the next pictures (none takes them off); the bytes are let go once the map has loaded those.
      const done = shown;
      window.setTimeout(() => {
        for (const url of done) releaseShade(url);
      }, 5_000);
    };
  }, [engine, group, pictures, opacity]);

  useEffect(() => () => engine?.setShades(group, []), [engine, group]);
}
