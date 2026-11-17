/**
 * The phone's own compass, corrected to true and to grid north by the figures above it.
 * Nothing is asked of the device until Start is pressed; Stop, hiding the page or leaving
 * the screen lets go of it (live-heading.ts). On a plain http page, or a computer with no
 * compass, the card says what a live compass needs; the rest of the screen still works.
 */
import { compassPoint, convertBearing, type North, type Norths } from "@outpost/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { Calculator, HowWorkedOut } from "../tools/kit";
import { useLiveHeading } from "./live-heading";
import { COMPASS_SOURCES as S } from "./sources";

const NORTH_NAMES: Record<North, string> = { true: "True", grid: "Grid", magnetic: "Magnetic" };
const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/** A bearing as a walker writes it: three figures, to the whole degree. */
export const threeFigures = (bearing: number) => `${String(Math.round(bearing) % 360).padStart(3, "0")}°`;

function HttpsLink() {
  return (
    <Link to="/settings#https" className={link}>
      Settings, “HTTPS on your network”
    </Link>
  );
}

export function LiveCompass({ norths }: { norths: Norths | null }) {
  const [open, setOpen] = useState(false);
  const { state, heading, start } = useLiveHeading(open);
  const onGrid = norths?.convergence != null;
  const [chosen, setChosen] = useState<North>("magnetic");
  const shownNorth: North = chosen === "grid" && !onGrid ? "true" : chosen;
  const secure = typeof window !== "undefined" && window.isSecureContext;

  const offsets = norths ? { declination: norths.declination, convergence: norths.convergence } : null;
  const value = (north: North) =>
    heading
      ? north === "magnetic"
        ? heading.magnetic
        : offsets
          ? convertBearing(heading.magnetic, "magnetic", north, offsets)
          : null
      : null;
  const big = value(shownNorth);
  const others = (["magnetic", "true", "grid"] as const).filter((north) => north !== shownNorth && (north !== "grid" || onGrid));

  return (
    <Calculator
      id="live"
      title="Live compass"
      intro="The phone's own compass, shown from magnetic, true or grid north. It listens only while this card is on and the screen is in view."
    >
      {!secure || state === "insecure" ? (
        <Notice tone="info" title="A live compass needs HTTPS and a phone">
          Browsers give a page the phone's compass only when it is opened at an HTTPS address. Turn on <HttpsLink />, then open Outpost at
          its https address on the phone. Everything else on this screen works without it.
        </Notice>
      ) : state === "none" ? (
        <Notice tone="info" title="This device gives no compass heading">
          A live compass needs a phone or tablet with a compass in it, and Outpost opened at an HTTPS address (<HttpsLink />
          ). A computer has none. Everything else on this screen works without it.
          <div className="mt-2">
            <Button size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Notice>
      ) : state === "denied" ? (
        <Notice tone="warning" title="The compass was not allowed">
          This browser was told not to share the phone's motion sensors with this page. On an iPhone, close this tab, open the page again,
          press Start the compass and choose Allow. On Android, allow Motion sensors in the page's site settings (the icon beside the
          address).
          <div className="mt-2">
            <Button size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Notice>
      ) : !open ? (
        <Button
          variant="primary"
          onClick={() => {
            setOpen(true);
            void start();
          }}
        >
          Start the compass
        </Button>
      ) : (
        <div className="rounded-panel bg-surface px-4 py-3" data-live-compass>
          {state === "live" && heading && big !== null ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Dial bearing={big} />
              <div aria-live="off" className="min-w-0">
                <p className="text-small text-ink-muted">{NORTH_NAMES[shownNorth]} bearing of the top of the phone</p>
                <p className="font-title text-title text-ink tabular">
                  {threeFigures(big)} <span className="text-heading text-ink-muted">{compassPoint(big)}</span>
                </p>
                <p className="text-small text-ink tabular">
                  {others.map((north) => {
                    const each = value(north);
                    return each === null ? null : (
                      <span key={north} className="mr-3 whitespace-nowrap">
                        {NORTH_NAMES[north]} {threeFigures(each)}
                      </span>
                    );
                  })}
                </p>
                {heading.accuracy !== null ? (
                  <p className="text-small text-ink-muted">The phone says it is good to ±{Math.round(heading.accuracy)}°.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-body text-ink-muted" aria-live="polite">
              {state === "asking" ? "Waiting for you to allow the compass." : "Waiting for the phone's compass."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Segmented
              label="Show the bearing from"
              value={shownNorth}
              onChange={setChosen}
              options={(onGrid ? (["magnetic", "true", "grid"] as const) : (["magnetic", "true"] as const)).map((north) => ({
                value: north,
                label: NORTH_NAMES[north],
              }))}
            />
            <Button onClick={() => setOpen(false)}>Stop the compass</Button>
          </div>
          {!norths ? <p className="mt-2 text-small text-ink-muted">Choose a place above to correct it to true and grid north.</p> : null}
        </div>
      )}
      <p className="mt-4 max-w-[60ch] text-small text-ink-muted">
        A phone's compass is easily thrown by metal, magnets (a case's clasp, a speaker) and cars: stand clear of them, hold the phone flat,
        and if it seems wrong move it in a slow figure of eight. Check it against the sun: the{" "}
        <Link to="/tools/solar-clock" className={link}>
          Solar clock
        </Link>{" "}
        gives the sun's true bearing now: hold the phone flat with its top towards the sun, never looking at the sun itself, and the True
        figure here should be close to it.
      </p>
      <HowWorkedOut
        formula={
          <p>
            The phone gives a heading from magnetic north. True bearing = magnetic bearing + declination; grid bearing = true bearing −
            convergence, with the figures from North here. On an iPhone the heading is the one Safari gives; on Android it is worked from
            the phone's orientation angles, as the top edge points while the phone is flat and as the back points while it is held up.
          </p>
        }
        range="Phones and tablets with a compass, at an HTTPS address. Not tried on a real phone while this was built."
        limits="How well the phone's own sensor is set: it is easily thrown, and no figure here can correct it."
        sources={[S.orientation, S.wmm]}
      />
    </Calculator>
  );
}

/** A small card of a dial: the needle points to the north being shown, turned as the phone turns. Drawn only when the figure changes. */
function Dial({ bearing }: { bearing: number }) {
  return (
    <svg viewBox="-50 -50 100 100" className="size-24 shrink-0 text-ink" aria-hidden>
      <circle r="46" fill="none" stroke="var(--border-strong)" strokeWidth="2" />
      <g transform={`rotate(${-Math.round(bearing)})`}>
        <path d="M0 -40 L7 0 L-7 0 Z" fill="var(--danger)" />
        <path d="M0 40 L7 0 L-7 0 Z" fill="currentColor" opacity="0.35" />
        <text x="12" y="-30" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill="currentColor">
          N
        </text>
      </g>
      <path d="M0 -50 L0 -40" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
