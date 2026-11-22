/**
 * Founding a settlement: choose the kind of land, see what it means (sun and wind for
 * power, the cold, the harvest, water, what lies on its map), and the seed the map is
 * drawn up from, which can be typed in to share a map with someone else.
 */
import {
  ARRAY_KWP,
  cleanSeed,
  harvestFactor,
  heatFactor,
  LAND_IDS,
  LANDS,
  type LandId,
  MAP_SIZE,
  seedFromNumber,
} from "@outpost/shared/games/steading";
import { Shuffle } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import type { Act } from "./panels";
import { GroundLayer } from "./valley";
import { amount, holds } from "./words";

const randomSeed = () => seedFromNumber(Math.floor(Math.random() * 2 ** 31));

export function FoundSettlement({ busy, act }: { busy: boolean; act: Act }) {
  const [land, setLand] = useState<LandId>("valley");
  const [seedText, setSeedText] = useState(randomSeed);
  const seed = cleanSeed(seedText) || "steading";
  const name = useId();
  const l = LANDS[land];
  const average = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const facts = useMemo(() => holds(land, seed), [land, seed]);
  return (
    <div className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <p className="text-body text-ink">
          Choose the land to found the settlement in. Each is drawn from a real place: its sun and wind are what that place gets, month by
          month, and they decide what solar panels and a turbine make there. The map, {MAP_SIZE} squares each way, is drawn up from the
          seed.
        </p>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-small font-medium text-ink">Land</legend>
          {LAND_IDS.map((id) => {
            const each = LANDS[id];
            return (
              <label
                key={id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-2 py-2 hover:bg-surface",
                  land === id && "bg-surface",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={id}
                  checked={land === id}
                  onChange={() => setLand(id)}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-body text-ink">{each.name}</span>
                  <span className="block text-small text-ink-muted">{each.about}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
      <div className="grid content-start gap-4">
        <div className="mx-auto w-full max-w-80 overflow-hidden rounded-panel border border-border">
          <svg
            viewBox={`0 0 ${MAP_SIZE * 10} ${MAP_SIZE * 10}`}
            className="block aspect-square w-full"
            role="img"
            aria-labelledby={`${name}-map`}
          >
            <title id={`${name}-map`}>{`The map this land and seed draw: ${facts}`}</title>
            <GroundLayer map={{ land, seed }} />
          </svg>
        </div>
        <dl className="divide-y divide-border border-y border-border text-small">
          <Fact label="Drawn from">{l.place}</Fact>
          <Fact label="Sun">
            A {ARRAY_KWP} kW array makes {amount(ARRAY_KWP * (l.solarKwhPerKwp[5] ?? 0))} kWh a day in June and{" "}
            {amount(ARRAY_KWP * (l.solarKwhPerKwp[11] ?? 0))} in December
          </Fact>
          <Fact label="Wind">
            A 10 kW turbine makes {amount(average(l.turbineKwh))} kWh a day on average (wind {amount(average(l.windMs))} m/s at 10 m)
          </Fact>
          <Fact label="Cold">
            Mean {amount(Math.min(...l.meanC))} °C in the coldest month; a household burns {amount(heatFactor(land) * 100)}% of the firewood
            it would in the river valley
          </Fact>
          <Fact label="Harvest">
            A field grows {formatNumber(Math.round(harvestFactor(land) * 100))}% of the river valley's grain
            {l.fieldsNearWater !== null ? `, and only within ${l.fieldsNearWater} squares of water` : ""}
          </Fact>
          <Fact label="Water">A well draws {formatNumber(l.wellLitres)} litres a day</Fact>
          {l.houseExtraBricks ? <Fact label="Houses">{l.houseExtraBricks} more bricks each, for thicker walls</Fact> : null}
          <Fact label="On this map">{facts}</Fact>
        </dl>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            act({ type: "found", land, seed });
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Seed" className="min-w-0 flex-1 basis-48" hint="The same land and seed draw the same map on any Outpost.">
              {(ids) => (
                <Input
                  {...ids}
                  value={seedText}
                  maxLength={24}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setSeedText(event.target.value)}
                />
              )}
            </Field>
            <Button type="button" variant="secondary" onClick={() => setSeedText(randomSeed())}>
              <Shuffle aria-hidden />
              Another seed
            </Button>
          </div>
          <div>
            <Button type="submit" variant="primary" loading={busy}>
              Found the settlement
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 py-1.5 max-sm:grid-cols-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular text-ink">{children}</dd>
    </div>
  );
}
