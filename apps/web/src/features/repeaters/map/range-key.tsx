/**
 * What the lines of an estimated range on the map mean, in one short row under the answer: the ground in sight, the
 * typical range and the distance rings, each beside a swatch drawn as the map draws it.
 */
export function RangeKey({ typical }: { typical: boolean }) {
  return (
    <ul aria-label="What the map shows" className="flex flex-wrap gap-x-3 gap-y-1 text-micro text-ink-muted">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block size-3 rounded-sm border-2 border-[var(--map-range)] bg-[var(--map-range)]/55" />
        In sight
      </li>
      {typical ? (
        <li className="flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 18 6" className="h-1.5 w-[18px]">
            <line x1="0" x2="18" y1="3" y2="3" stroke="var(--map-range-typical)" strokeWidth="2.5" strokeDasharray="5 2.5" />
          </svg>
          Typical range
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <svg aria-hidden viewBox="0 0 18 6" className="h-1.5 w-[18px]">
          <line x1="0" x2="18" y1="3" y2="3" stroke="var(--ink-muted)" strokeWidth="1.25" />
        </svg>
        Distance rings
      </li>
    </ul>
  );
}
