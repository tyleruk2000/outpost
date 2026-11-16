/**
 * The legend for the Environment Agency's flood zones, under their switch in the Layers
 * panel: each zone in the Agency's own words with its swatch (told apart by tone and
 * edge, as on the map), the Agency's caveat that the zones are not for an individual
 * property, and that a planning zone is not a forecast. England only.
 */
import { FLOOD_ZONE_WORDS } from "@outpost/shared";

function ZoneMark({ colour, zone }: { colour: string; zone: 2 | 3 }) {
  return (
    <svg viewBox="0 0 24 16" className="mt-0.5 h-4 w-6 shrink-0" aria-hidden>
      <rect
        x="1"
        y="1"
        width="22"
        height="14"
        rx="1.5"
        fill={colour}
        fillOpacity={zone === 3 ? 0.42 : 0.16}
        stroke={colour}
        strokeWidth={zone === 3 ? 1.6 : 1.3}
        strokeDasharray={zone === 3 ? undefined : "3 2"}
      />
    </svg>
  );
}

export function FloodZonesLegend({ colour, status }: { colour: string; status: "zoom-in" | "too-many" | null | undefined }) {
  return (
    <section className="mt-2 grid gap-2 pl-[30px]" aria-label="Flood zones legend">
      {status === "zoom-in" ? (
        <p className="text-small text-ink">Zoom in to see the flood zones: they are drawn from about a town's width across.</p>
      ) : status === "too-many" ? (
        <p className="text-small text-ink">There are too many flood areas in this view to draw. Zoom in.</p>
      ) : null}
      <ul className="grid gap-2">
        <li className="flex items-start gap-2 text-small text-ink">
          <ZoneMark colour={colour} zone={3} />
          <span>
            Deeper tone, solid edge. <q>{FLOOD_ZONE_WORDS.zone3}</q>
          </span>
        </li>
        <li className="flex items-start gap-2 text-small text-ink">
          <ZoneMark colour={colour} zone={2} />
          <span>
            Lighter tone, broken edge. <q>{FLOOD_ZONE_WORDS.zone2}</q>
          </span>
        </li>
      </ul>
      <p className="text-small text-ink-muted">
        England only. The Environment Agency's map {FLOOD_ZONE_WORDS.defences}. <q>{FLOOD_ZONE_WORDS.caveat}</q>
      </p>
      <p className="text-small text-ink-muted">{FLOOD_ZONE_WORDS.notForecast}</p>
      <p className="text-micro text-ink-muted">{FLOOD_ZONE_WORDS.attribution} Open Government Licence v3.0.</p>
    </section>
  );
}
