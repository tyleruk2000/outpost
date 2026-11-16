/** The marks of the map's legend, drawn as they are on the map: a filled dot, a ring with H, a ring with ?. */
import type { FeatureProvenance } from "@outpost/shared";
import { PROVENANCE_INFO } from "@outpost/shared";

export function ProvenanceMark({ provenance, colour }: { provenance: FeatureProvenance; colour?: string }) {
  const fill = colour ?? "var(--ink-muted)";
  const letter = provenance === "historical" ? "H" : provenance === "unverified" ? "?" : "";
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0" role="img" aria-label={PROVENANCE_INFO[provenance].shape}>
      {letter ? (
        <>
          <circle cx="9" cy="9" r="7" fill="var(--page)" stroke={fill} strokeWidth="2" />
          <text x="9" y="12.4" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--ink)">
            {letter}
          </text>
        </>
      ) : provenance === "user" ? (
        <path d="M9 1.5c-3 0-5.4 2.3-5.4 5.3C3.6 10.6 9 16.5 9 16.5s5.4-5.9 5.4-9.7c0-3-2.4-5.3-5.4-5.3Z" fill={fill} />
      ) : (
        <circle cx="9" cy="9" r="5.5" fill={fill} stroke="var(--page)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/** A swatch of a layer's colour as an area: for layers drawn as outlines. */
export function AreaMark({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0" aria-hidden>
      <rect x="2" y="3" width="14" height="12" rx="1.5" fill={colour} fillOpacity="0.15" stroke={colour} strokeWidth="1.6" />
    </svg>
  );
}
