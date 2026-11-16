/**
 * Where a thing on the nuclear preparedness map comes from, said the same way
 * everywhere: five classes (the specification's section 10), each with its own icon,
 * word and edge, so that they are told apart without colour. A record never changes
 * class by being filtered, sorted or drawn: the class is part of the record.
 *
 * In this version only "Modelled effects" (the simulator's rings and plume) and "Made
 * by you" (saved places and scenarios) have anything in them; the other three are for
 * the data layers that come later, and the key says they are empty.
 */
import { CircleHelp, Landmark, type LucideIcon, ScrollText, Sigma, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type Provenance = "public" | "historical" | "model" | "own" | "unverified";

export const PROVENANCE: Record<Provenance, { label: string; short: string; icon: LucideIcon; edge: string; about: string }> = {
  public: {
    label: "Verified public infrastructure",
    short: "Public record",
    icon: Landmark,
    edge: "border-solid",
    about: "Facilities as a public source records them, with the source and its date.",
  },
  historical: {
    label: "Historical documentation",
    short: "Historical",
    icon: ScrollText,
    edge: "border-double border-[3px]",
    about: "What a declassified or archived document says, for the period it covers. Never a statement about today.",
  },
  model: {
    label: "Modelled effects",
    short: "Model",
    icon: Sigma,
    edge: "border-dashed",
    about: "Worked out by a published model for an idealised case. An estimate, not a forecast.",
  },
  own: {
    label: "Made by you",
    short: "Yours",
    icon: UserRound,
    edge: "border-solid bg-surface-strong",
    about: "Places, scenarios and notes you made. Kept on this device.",
  },
  unverified: {
    label: "Unverified or speculative",
    short: "Unverified",
    icon: CircleHelp,
    edge: "border-dotted border-2",
    about: "A claim no source this module trusts confirms. Shown as such, never as fact.",
  },
};

export function ProvenanceBadge({ kind, className }: { kind: Provenance; className?: string }) {
  const item = PROVENANCE[kind];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-control border border-border-strong px-1.5 py-0.5 text-micro font-medium text-ink-muted",
        item.edge,
        className,
      )}
      title={item.label}
    >
      <item.icon aria-hidden className="size-3.5" />
      <span>
        <span className="sr-only">Source: </span>
        {item.short}
      </span>
    </span>
  );
}

/** The key to the five classes, with what is in each in this version. */
export function ProvenanceKey({ held }: { held: Partial<Record<Provenance, number>> }) {
  return (
    <ul className="grid gap-2" aria-label="Where things on this map come from">
      {(Object.keys(PROVENANCE) as Provenance[]).map((kind) => {
        const count = held[kind] ?? 0;
        return (
          <li key={kind} className="flex items-start gap-2.5">
            <ProvenanceBadge kind={kind} className="mt-0.5" />
            <span className="min-w-0 text-small">
              <span className="text-ink">{PROVENANCE[kind].label}.</span>{" "}
              <span className="text-ink-muted">
                {PROVENANCE[kind].about}
                {kind === "public" || kind === "historical" || kind === "unverified" ? " Nothing of this kind is in this version yet." : ""}
                {kind === "own" && count > 0 ? ` ${count} on this map.` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
