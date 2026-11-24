/**
 * The ground track on the screen: where on the Earth the satellite is overhead over one
 * turn, two, or the pass chosen, drawn flat with no map tiles (Natural Earth's land, kept
 * by Outpost itself), so it works with no internet. Night is shaded, the part of the
 * track above the place's horizon is heavier, a tick marks each 10 minutes, and the
 * dashed ring is where the satellite must be to be above the horizon. A caption says it in
 * words, and the track is given as a table too. A geostationary satellite is one dot.
 * The geometry is ground-track.ts, which the PDF draws from as well.
 */
import { compassPoint } from "@outpost/shared";
import { type ReactNode, useMemo, useState } from "react";
import { Disclosure } from "@/components/page";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { useLand } from "@/features/propagation/print/use-land";
import { useWidth } from "@/lib/use-width";
import { cn } from "@/lib/utils";
import { footprintRadiusKm, type ObserverLocation, type Orbit, type SatellitePass, satelliteState } from "./engine";
import {
  boxOf,
  footprintPieces,
  landPath,
  longitudeWords,
  nightPath,
  overWords,
  pathOf,
  project,
  revolutionsPerDay,
  sampleTrack,
  stationary,
  type TrackSample,
  ticksOf,
  trackFigure,
  trackWords,
  upSpans,
} from "./ground-track";
import { utcTime } from "./words";

type Stretch = "1" | "2" | "pass";
const LABEL_SIZE = 11;

const stretchWords = (stretch: Stretch) => (stretch === "1" ? "this turn" : stretch === "2" ? "these two turns" : "this stretch");

function KeyItem({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg aria-hidden width="22" height="12" viewBox="0 0 22 12" className="shrink-0">
        {mark}
      </svg>
      {children}
    </li>
  );
}

export function GroundTrack({
  orbit,
  observer,
  placeName,
  now,
  pass,
  passes,
}: {
  orbit: Orbit;
  observer: ObserverLocation | null;
  placeName: string;
  now: Date;
  /** The pass chosen, for "This pass". */
  pass: SatellitePass | null;
  /** Passes over the place in the next day, to say when next where none is drawn. */
  passes: SatellitePass[];
}) {
  const [chosen, setChosen] = useState<Stretch>("2");
  const passable = pass && !pass.alwaysUp ? pass : null;
  const stretch: Stretch = chosen === "pass" && !passable ? "2" : chosen;
  const [frame, measured] = useWidth();
  const width = measured > 0 ? measured : 640;
  const { land, settled } = useLand();
  const minute = Math.floor(now.getTime() / 60_000);
  const still = useMemo(() => {
    try {
      return stationary(orbit);
    } catch {
      return false;
    }
  }, [orbit]);

  const drawn = useMemo(() => {
    if (still) return null;
    const at = new Date(minute * 60_000);
    const period = (1440 / revolutionsPerDay(orbit)) * 60_000;
    const from = stretch === "pass" && pass ? new Date(pass.aos.getTime() - 45 * 60_000) : new Date(at.getTime() - 10 * 60_000);
    const to = stretch === "pass" && pass ? new Date(pass.los.getTime() + 45 * 60_000) : new Date(at.getTime() + Number(stretch) * period);
    const span = (to.getTime() - from.getTime()) / 1000;
    const samples = sampleTrack(orbit, observer, from, to, Math.max(30, Math.round(span / 480 / 30) * 30));
    let current: TrackSample | null = null;
    if (at >= from && at <= to) {
      const state = satelliteState(orbit, observer ?? { lat: 0, lon: 0 }, at);
      current = { ...state, azimuthDeg: observer ? state.azimuthDeg : null, elevationDeg: observer ? state.elevationDeg : null };
    }
    const nightAt = stretch === "pass" && pass ? pass.tca.getTime() : at.getTime();
    const ringAltitude =
      stretch === "pass" && pass ? satelliteState(orbit, observer ?? { lat: 0, lon: 0 }, pass.tca).altitudeKm : current?.altitudeKm;
    return { from, to, samples, current, nightAt, ringAltitude: ringAltitude ?? samples[0]?.altitudeKm ?? null };
  }, [still, orbit, observer, stretch, pass, minute]);

  const figure = useMemo(
    () =>
      drawn
        ? trackFigure({
            width,
            samples: drawn.samples,
            land: null,
            nightAt: drawn.nightAt,
            home: observer,
            now: drawn.current,
            ringAltitudeKm: observer ? drawn.ringAltitude : null,
            labelSize: LABEL_SIZE,
          })
        : null,
    [drawn, width, observer],
  );
  const box = boxOf(width);
  const landD = useMemo(() => landPath(land, boxOf(width)), [land, width]);
  const stillNight = useMemo(() => (still ? nightPath(minute * 60_000, boxOf(width)) : ""), [still, minute, width]);

  // ── Geostationary: one dot, and where it can be seen from ──
  if (still) {
    const state = satelliteState(orbit, observer ?? { lat: 0, lon: 0 }, new Date(minute * 60_000));
    const dot = project([state.lon, state.lat], box);
    const home = observer ? project([observer.lon, observer.lat], box) : null;
    const seen = observer
      ? state.elevationDeg > 0
        ? `Seen from ${placeName} ${Math.round(state.elevationDeg)}° above the horizon, bearing ${Math.round(state.azimuthDeg)}° ${compassPoint(state.azimuthDeg)}, all day.`
        : `Never above the horizon at ${placeName}: ${placeName} is outside the dashed line.`
      : "";
    const caption = `Geostationary: stays over ${longitudeWords(state.lon)}, above the equator. ${seen} The dashed line is the edge of where it can be seen; night is shaded as now.`;
    return (
      <figure className="mt-6 grid gap-2">
        <h3 className="text-body font-semibold text-ink">Ground track</h3>
        <div ref={frame} className="w-full">
          {settled ? (
            <svg
              width={box.width}
              height={box.height}
              viewBox={`0 0 ${box.width} ${box.height}`}
              role="img"
              aria-label={`Ground track. ${caption}`}
              className="block max-w-full"
            >
              <World width={box.width} height={box.height} land={landD} night={stillNight} />
              {footprintPieces({ lat: state.lat, lon: state.lon }, footprintRadiusKm(state.altitudeKm)).map((piece) => (
                <path
                  key={piece[0]!.join()}
                  d={pathOf(piece, box)}
                  fill="none"
                  stroke="var(--color-chart-2)"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />
              ))}
              {home ? <HomeMark at={home} /> : null}
              <NowMark at={dot} />
            </svg>
          ) : (
            <Skeleton className="w-full" style={{ height: box.height }} />
          )}
        </div>
        <figcaption className="max-w-[70ch] text-small text-ink-muted">{caption}</figcaption>
      </figure>
    );
  }

  if (!drawn || !figure) return null;
  const spans = observer ? upSpans(drawn.samples) : [];
  const next = passes.find((item) => item.aos > drawn.to)?.aos ?? null;
  const words = trackWords({ now: drawn.current, spans, placeName: observer ? placeName : null, next, stretch: stretchWords(stretch) });
  const caption = `${words} Night is shaded as ${stretch === "pass" ? `at its highest, ${utcTime(drawn.nightAt)} UTC` : "now"}.`;
  const ticks = ticksOf(drawn.samples);

  return (
    <figure className="mt-6 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-body font-semibold text-ink">Ground track</h3>
        <Segmented
          label="How much of the track"
          value={stretch}
          onChange={setChosen}
          options={[
            { value: "1" as const, label: "1 turn" },
            { value: "2" as const, label: "2 turns" },
            ...(passable ? [{ value: "pass" as const, label: "This pass" }] : []),
          ]}
        />
      </div>
      <div ref={frame} className="w-full">
        {settled ? (
          <svg
            width={figure.box.width}
            height={figure.box.height}
            viewBox={`0 0 ${figure.box.width} ${figure.box.height}`}
            role="img"
            aria-label={`Ground track. ${caption}`}
            className="block max-w-full"
          >
            <World width={figure.box.width} height={figure.box.height} land={landD} night={figure.night} />
            {figure.ring.map((d) => (
              <path key={d.slice(0, 40)} d={d} fill="none" stroke="var(--color-chart-2)" strokeWidth="1.5" strokeDasharray="5 4" />
            ))}
            {figure.runs
              .filter((run) => !run.up)
              .map((run, index) => (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: the runs of one track, in order, never reordered
                  key={index}
                  d={run.d}
                  fill="none"
                  stroke="var(--color-ink-muted)"
                  strokeWidth="1.5"
                  strokeDasharray={run.past ? "2 3" : undefined}
                  strokeLinejoin="round"
                />
              ))}
            {figure.runs
              .filter((run) => run.up)
              .map((run, index) => (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: as above
                  key={index}
                  d={run.d}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={run.past ? "5 4" : undefined}
                />
              ))}
            {figure.ticks.map((tick) => (
              <circle
                key={tick.at.getTime()}
                cx={tick.xy[0]}
                cy={tick.xy[1]}
                r="2.6"
                fill="var(--color-page)"
                stroke="var(--color-ink)"
                strokeWidth="1.2"
              />
            ))}
            {figure.ticks.map((tick) =>
              tick.label ? (
                <text
                  key={`t${tick.at.getTime()}`}
                  x={tick.label.x}
                  y={tick.label.y}
                  textAnchor={tick.label.anchor}
                  fontSize={LABEL_SIZE}
                  fontWeight="600"
                  fill="var(--color-ink)"
                  stroke="var(--color-page)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  className="tabular"
                >
                  {tick.label.text}
                </text>
              ) : null,
            )}
            {figure.home ? <HomeMark at={figure.home} /> : null}
            {figure.now ? <NowMark at={figure.now} /> : null}
          </svg>
        ) : (
          <Skeleton className="w-full" style={{ height: figure.box.height }} />
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted" aria-label="Key">
        {observer ? (
          <KeyItem mark={<path d="M2 6H20" stroke="var(--color-primary)" strokeWidth="4.5" strokeLinecap="round" />}>
            Above the horizon at {placeName}
          </KeyItem>
        ) : null}
        <KeyItem mark={<path d="M1 6H21" stroke="var(--color-ink-muted)" strokeWidth="1.5" />}>The track</KeyItem>
        <KeyItem mark={<path d="M1 6H21" stroke="var(--color-ink-muted)" strokeWidth="1.5" strokeDasharray="2 3" />}>
          Already gone by
        </KeyItem>
        <KeyItem mark={<circle cx="11" cy="6" r="2.6" fill="var(--color-page)" stroke="var(--color-ink)" strokeWidth="1.2" />}>
          Every 10 minutes, UTC
        </KeyItem>
        {observer ? (
          <>
            <KeyItem mark={<rect x="6.5" y="1.5" width="9" height="9" fill="var(--color-ink)" />}>{placeName}</KeyItem>
            <KeyItem mark={<path d="M1 6H21" stroke="var(--color-chart-2)" strokeWidth="1.5" strokeDasharray="5 4" />}>
              Inside this, it is above the horizon
            </KeyItem>
          </>
        ) : null}
        {figure.now ? (
          <KeyItem
            mark={
              <>
                <circle cx="11" cy="6" r="5" fill="none" stroke="var(--color-lamp-ink)" strokeWidth="1.6" />
                <circle cx="11" cy="6" r="2.6" fill="var(--color-primary)" />
              </>
            }
          >
            Now
          </KeyItem>
        ) : null}
      </ul>
      <figcaption className="max-w-[70ch] text-small text-ink">{caption}</figcaption>
      <Disclosure summary="The track as a table">
        <Table label="The ground track every 10 minutes">
          <TableHead>
            <Tr>
              <Th numeric className="px-2">
                UTC
              </Th>
              <Th className="px-2">Over</Th>
              {observer ? (
                <>
                  <Th numeric className="px-2">
                    Bearing
                  </Th>
                  <Th numeric className="px-2">
                    Height
                  </Th>
                </>
              ) : null}
            </Tr>
          </TableHead>
          <tbody>
            {ticks.map((tick) => {
              const up = tick.elevationDeg !== null && tick.elevationDeg >= 0;
              return (
                <Tr key={tick.at.getTime()} className={cn(up && "font-semibold")}>
                  <Td numeric className="px-2 py-1.5">
                    {utcTime(tick.at)}
                  </Td>
                  <Td className="px-2 py-1.5 whitespace-nowrap tabular">{overWords(tick.lat, tick.lon).replace(/° /g, "°")}</Td>
                  {observer ? (
                    <>
                      <Td numeric className="px-2 py-1.5 whitespace-nowrap">
                        {Math.round(tick.azimuthDeg ?? 0)}° {compassPoint(tick.azimuthDeg ?? 0)}
                      </Td>
                      <Td numeric className="px-2 py-1.5 whitespace-nowrap">
                        {up ? `${Math.round(tick.elevationDeg ?? 0)}° up` : "below"}
                      </Td>
                    </>
                  ) : null}
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <p className="text-ink-muted">
          {observer
            ? `Bearing and height as seen from ${placeName}; "below" is under the horizon. Rows in bold are above it.`
            : "Choose a place to see the bearing and height from there."}
        </p>
      </Disclosure>
    </figure>
  );
}

function World({ width, height, land, night }: { width: number; height: number; land: string; night: string }) {
  const lines: ReactNode[] = [];
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = ((lon + 180) / 360) * width;
    lines.push(<path key={`x${lon}`} d={`M${x} 0V${height}`} />);
  }
  for (const lat of [-60, -30, 0, 30, 60]) {
    const y = project([0, lat], { width, height })[1];
    lines.push(<path key={`y${lat}`} d={`M0 ${y}H${width}`} />);
  }
  return (
    <>
      <rect width={width} height={height} fill="var(--color-surface)" />
      <path d={land} fill="var(--color-border)" />
      <g stroke="var(--color-chart-grid)" strokeWidth="0.75" opacity="0.7">
        {lines}
      </g>
      <path d={night} fill="var(--color-overlay)" opacity="0.6" />
      <rect width={width} height={height} fill="none" stroke="var(--color-border)" />
    </>
  );
}

function HomeMark({ at: [x, y] }: { at: [number, number] }) {
  return <rect x={x - 5} y={y - 5} width="10" height="10" fill="var(--color-ink)" stroke="var(--color-page)" strokeWidth="1.5" />;
}

function NowMark({ at: [x, y] }: { at: [number, number] }) {
  return (
    <g>
      <circle cx={x} cy={y} r="8" fill="none" stroke="var(--color-page)" strokeWidth="4" />
      <circle cx={x} cy={y} r="8" fill="none" stroke="var(--color-lamp-ink)" strokeWidth="2.2" />
      <circle cx={x} cy={y} r="4" fill="var(--color-primary)" stroke="var(--color-page)" strokeWidth="1.2" />
    </g>
  );
}
