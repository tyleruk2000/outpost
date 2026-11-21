/**
 * Every pass of many satellites over one place, worked out a few satellites at a time so
 * that the screen stays responsive and the list fills in as it goes (LogBook73's
 * usePassSchedule). About 5 ms of SGP4 per satellite per day on a laptop; a phone or a
 * Raspberry Pi's browser takes longer, which is why progress is shown.
 */
import type { SatelliteElements } from "@outpost/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ObserverLocation, passSchedule, type ScheduledPass } from "./engine";

const CHUNK = 8;

export interface ScheduleState {
  entries: ScheduledPass[];
  done: number;
  total: number;
  computing: boolean;
}

export function usePassSchedule(
  satellites: readonly SatelliteElements[] | undefined,
  observer: ObserverLocation | null,
  from: Date,
  options: { hours: number; minElevationDeg?: number },
): ScheduleState {
  const [state, setState] = useState<ScheduleState>({ entries: [], done: 0, total: 0, computing: false });
  const { hours, minElevationDeg = 0 } = options;
  const key = useMemo(
    () =>
      observer && satellites
        ? [
            satellites.length,
            satellites[0]?.noradId,
            satellites.at(-1)?.noradId,
            satellites[0]?.epoch,
            observer.lat.toFixed(4),
            observer.lon.toFixed(4),
            from.getTime(),
            hours,
            minElevationDeg,
          ].join("|")
        : null,
    [satellites, observer, from, hours, minElevationDeg],
  );
  const inputs = useRef({ satellites, observer, from });
  inputs.current = { satellites, observer, from };

  useEffect(() => {
    const { satellites: list, observer: place, from: start } = inputs.current;
    if (key === null || !list || !place) {
      setState({ entries: [], done: 0, total: 0, computing: false });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const collected: ScheduledPass[] = [];
    setState({ entries: [], done: 0, total: list.length, computing: list.length > 0 });
    const step = (index: number) => {
      if (cancelled) return;
      collected.push(...passSchedule(list.slice(index, index + CHUNK), place, start, { hours, minElevationDeg }));
      const done = Math.min(index + CHUNK, list.length);
      const entries = [...collected].sort((a, b) => a.pass.aos.getTime() - b.pass.aos.getTime());
      setState({ entries, done, total: list.length, computing: done < list.length });
      if (done < list.length) timer = setTimeout(() => step(done), 0);
    };
    timer = setTimeout(() => step(0), 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, hours, minElevationDeg]);

  return state;
}
