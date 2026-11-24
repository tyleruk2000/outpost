/** What the shapes on the repeaters' map mean: one short row under the map, each shape beside its bands. */
import { BAND_SHAPES, BandMark } from "./band-shapes";

export function BandKey({ className }: { className?: string }) {
  return (
    <ul aria-label="What the shapes mean" className={className ?? "flex flex-wrap gap-x-3.5 gap-y-1 text-micro text-ink-muted"}>
      {BAND_SHAPES.map(({ shape, words }) => (
        <li key={shape} className="flex items-center gap-1.5">
          <BandMark shape={shape} />
          {words}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <BandMark shape="circle" hollow />
        Listed as not operational
      </li>
    </ul>
  );
}
