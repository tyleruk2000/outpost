/**
 * Keyer behaviour profiles + named radio presets.
 *
 * `mode`:
 *  - 'A'        Curtis mode A — release both paddles and the keyer finishes the
 *               current element and stops (pending memory is cancelled).
 *  - 'B'        Curtis mode B — a squeeze released mid-element sends one extra
 *               alternating element.
 *  - 'ultimatic' When both paddles are held, the LAST one pressed wins and
 *               repeats (no alternation).
 *
 * `ditDahMemory`: tapping the opposite paddle during an element latches one
 * element of that kind, inserted at the next element boundary.
 *
 * `weightPct`: mark/space weighting at a constant element rate. 50 = classic
 * 1:1 dit:gap. Higher = heavier (longer marks, shorter gaps).
 *
 * `dahRatio`: dah length in dit units (3.0 standard).
 */

export type KeyerMode = "A" | "B" | "ultimatic";

export interface KeyerProfile {
  mode: KeyerMode;
  ditDahMemory: boolean;
  weightPct: number;
  dahRatio: number;
}

export const DEFAULT_PROFILE: KeyerProfile = {
  mode: "B",
  ditDahMemory: true,
  weightPct: 50,
  dahRatio: 3,
};

export interface RadioPreset {
  id: string;
  label: string;
  /** e.g. "Curtis B, dit/dah memory" — shown under the preset name */
  blurb: string;
  profile: KeyerProfile;
}

/**
 * Named radio presets: each maker's default keyer behaviour as LogBook73 recorded it,
 * not checked here against each manual. Every one of them can be changed on the
 * radio itself; this is how it behaves out of the box.
 */
export const RADIO_PRESETS: readonly RadioPreset[] = [
  {
    id: "generic-b",
    label: "Generic (Curtis B)",
    blurb: "Mode B with dit and dah memory: the most common default",
    profile: { mode: "B", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "generic-a",
    label: "Generic (Curtis A)",
    blurb: "Mode A: stops as soon as you let go of both paddles",
    profile: { mode: "A", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "elecraft",
    label: "Elecraft K3/KX3",
    blurb: "Iambic A with dit and dah memory by default",
    profile: { mode: "A", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "yaesu",
    label: "Yaesu (FT-891/991A)",
    blurb: "Iambic B by default; the dah ratio can be changed, 3.0 to start",
    profile: { mode: "B", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "icom",
    label: "Icom (IC-7300/705)",
    blurb: "Iambic B with dot and dash memory by default",
    profile: { mode: "B", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "kenwood",
    label: "Kenwood (TS-590/890)",
    blurb: "Iambic A by default; mode B can be chosen",
    profile: { mode: "A", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "x6100",
    label: "Xiegu X6100",
    blurb: "Iambic B by default",
    profile: { mode: "B", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "winkeyer",
    label: "WinKeyer",
    blurb: "Iambic B by default",
    profile: { mode: "B", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
  {
    id: "ultimatic",
    label: "Ultimatic",
    blurb: "With both paddles held, the last one pressed repeats",
    profile: { mode: "ultimatic", ditDahMemory: true, weightPct: 50, dahRatio: 3 },
  },
];

export function presetById(id: string): RadioPreset | undefined {
  return RADIO_PRESETS.find((p) => p.id === id);
}
