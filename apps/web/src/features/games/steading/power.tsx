/**
 * The settlement's power: what the sun, the wind, the wheel and any generator make now,
 * what the houses and machines draw, the batteries (in amp-hours at their voltage, and
 * watt-hours), the generators' tanks, the land's month by month, and where the figures
 * come from.
 */
import {
  ARRAY_KWP,
  BANKS,
  CAN_LITRES,
  type Flows,
  FUEL_L_PER_KWH,
  FUEL_NO_LOAD_L_PER_KW_H,
  GENERATOR_KW,
  HOUSE_NEEDS,
  LAND_SOURCES,
  LANDS,
  POWERED_KWH,
  type SteadingState,
  TANK_LITRES,
  WHEEL_KWH,
} from "@outpost/shared/games/steading";
import { Disclosure } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { Act } from "./panels";
import { Heading } from "./panels";
import { amount, placeName } from "./words";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** kWh a day, as average watts too: "24 kWh a day (1,000 W)". */
/** One place, for a battery's figures. */
const one = (n: number) => formatNumber(Math.round(n * 10) / 10);
const kwh = (n: number) => `${amount(n)} kWh a day (${formatNumber(Math.round((n * 1000) / 24))} W)`;

export function Power({ state, flows, busy, act }: { state: SteadingState; flows: Flows; busy: boolean; act: Act }) {
  const p = flows.power;
  const line = p.line;
  const land = LANDS[state.map.land];
  const has = (kind: string) => state.buildings.some((b) => b.kind === kind);
  const any = ["wheel", "solar", "turbine", "generator", "leadbank", "lithiumbank"].some(has);
  const generators = state.buildings.filter((b) => b.kind === "generator");
  const banks = state.buildings.filter((b) => b.kind === "leadbank" || b.kind === "lithiumbank");
  const share = p.capacity > 0 ? p.stored / p.capacity : 0;
  return (
    <section aria-labelledby="steading-power" className="grid gap-2">
      <Heading id="steading-power">Power</Heading>
      {!any ? (
        <p className="text-small text-ink-muted">
          No power yet. Once 24 people live here, a water wheel, solar arrays, wind turbines, batteries and a generator can be built; they
          all feed one line for the whole settlement. Houses use it for light, and the sawmill, mill and smithy run twice as fast on it.
        </p>
      ) : (
        <>
          <p className="text-body text-ink">
            {p.weather.day ? "Daylight" : "Night"} in {MONTHS[p.weather.month]}: {amount(line.renewable + p.generator)} kWh a day made,{" "}
            {amount(line.want)} wanted
            {line.served < line.want - 1e-6 ? `, ${amount(line.want - line.served)} short` : ""}.
          </p>
          <dl className="divide-y divide-border border-y border-border text-small">
            {has("solar") ? <Row label="Sun">{kwh(p.sun)}</Row> : null}
            {has("turbine") ? <Row label="Wind">{kwh(p.wind)}</Row> : null}
            {has("wheel") ? <Row label="Water wheel">{kwh(p.wheel)}</Row> : null}
            {generators.length ? <Row label="Generators">{p.generator > 0 ? kwh(p.generator) : "Off"}</Row> : null}
            <Row label="Houses">
              {amount(flows.households.electricity.supply)} of {amount(flows.households.electricity.need)} kWh a day;{" "}
              {flows.households.electricity.lit} of {flows.households.occupied} lit
            </Row>
            <Row label="Machines">
              {amount(Math.max(0, line.served - flows.households.electricity.supply))} of{" "}
              {amount(Math.max(0, line.want - flows.households.electricity.need))} kWh a day
            </Row>
            {line.spilled > 0 ? <Row label="Spilled">{kwh(line.spilled)}, with nowhere to go</Row> : null}
          </dl>
          {banks.length ? (
            <div className="grid gap-1">
              <h3 className="text-body font-semibold text-ink">Batteries</h3>
              <p className="tabular text-small text-ink">
                {formatNumber(p.ampHours)} Ah in all, {one(p.nominalKwh)} kWh, of which {one(p.capacity)} kWh is used. Holding{" "}
                {one(p.stored)} kWh ({Math.round(share * 100)}% of what is used)
                {line.charging > 0
                  ? `, charging at ${amount(line.charging)} kWh a day`
                  : line.discharging > 0
                    ? `, giving ${amount(line.discharging)} kWh a day`
                    : line.bank === "empty"
                      ? ", down to the floor it is kept above"
                      : line.bank === "full"
                        ? ", full"
                        : ""}
                .
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-strong" aria-hidden>
                <div className="h-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              <ul className="grid list-disc gap-1 pl-5 text-small text-ink-muted">
                {banks.map((b) => {
                  const kind = BANKS[b.kind as keyof typeof BANKS];
                  return (
                    <li key={b.id}>
                      The {placeName(b)}: {kind.cells} cells of {kind.cellVolts} V in series, {formatNumber(kind.volts)} V and{" "}
                      {formatNumber(kind.ampHours)} Ah, {one(kind.kwh)} kWh; {Math.round(kind.usable * 100)}% used,{" "}
                      {Math.round(kind.roundTrip * 100)}% round trip.
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {generators.length ? (
            <div className="grid gap-2">
              <h3 className="text-body font-semibold text-ink">Generators</h3>
              {generators.map((g) => (
                <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="tabular min-w-0 flex-1 basis-56 text-small text-ink">
                    The {placeName(g)}: {amount(g.tank ?? 0)} of {TANK_LITRES} litres
                    {line.burning.get(g.id) ? `, burning ${amount(line.burning.get(g.id) ?? 0)} litres a day` : ""}.
                  </p>
                  <Button
                    size="sm"
                    disabled={busy || (g.tank ?? 0) > TANK_LITRES - CAN_LITRES || state.stock.diesel < 1}
                    onClick={() => act({ type: "fillTank", id: g.id })}
                  >
                    Fill the tank from the store
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
      <Disclosure summary={`The sun and wind of ${land.place}`}>
        <Table label={`The sun and wind of ${land.place}, month by month`} className="tabular">
          <thead className="text-left text-ink-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-1.5 pr-3 font-normal">
                Month
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                Array, kWh a day
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                Daylight, hours
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                Wind, m/s
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                Turbine, kWh a day
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Mean, °C
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MONTHS.map((month, i) => (
              <tr
                key={month}
                aria-current={i === p.weather.month ? "true" : undefined}
                className={i === p.weather.month ? "font-semibold" : undefined}
              >
                <th scope="row" className="py-1 pr-3 text-left font-normal text-ink">
                  {month}
                </th>
                <td className="py-1 pr-3 text-right text-ink">{amount(ARRAY_KWP * (land.solarKwhPerKwp[i] ?? 0))}</td>
                <td className="py-1 pr-3 text-right text-ink">{amount(land.daylightHours[i] ?? 0)}</td>
                <td className="py-1 pr-3 text-right text-ink">{amount(land.windMs[i] ?? 0)}</td>
                <td className="py-1 pr-3 text-right text-ink">{amount(land.turbineKwh[i] ?? 0)}</td>
                <td className="py-1 text-right text-ink">{amount(land.meanC[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-small text-ink">
          <li>
            An array is twelve 400 W panels, {ARRAY_KWP} kW at its peak. Its day's energy is made evenly through the daylight hours here,
            though a real panel makes most at noon. A settlement day passes in an hour, so the sun rises and sets each hour; the month is
            the calendar's.
          </li>
          <li>
            The batteries are charged with what the sun, wind and wheel make beyond the load, and give what they fall short of; each way
            loses the square root of the round trip. They are not let below their floor ({Math.round(BANKS.leadbank.usable * 100)}% used for
            lead acid, {Math.round(BANKS.lithiumbank.usable * 100)}% for LiFePO4). Limits on charge and discharge current are not counted.
          </li>
          <li>
            A generator is {GENERATOR_KW} kW with a {TANK_LITRES}-litre tank, and starts only when the batteries are at their floor. While
            it runs it burns {FUEL_NO_LOAD_L_PER_KW_H.toFixed(4)} litres an hour for each kW of its size, and {FUEL_L_PER_KWH.toFixed(4)}{" "}
            litres for each kWh it makes: about {amount(24 * (FUEL_NO_LOAD_L_PER_KW_H * GENERATOR_KW) + FUEL_L_PER_KWH * 24 * GENERATOR_KW)}{" "}
            litres a day at full load. It follows the load and does not charge the batteries.
          </li>
          <li>
            A house uses {amount(HOUSE_NEEDS.electricityKwh)} kWh a day, as a typical British household does; a sawmill, mill or smithy{" "}
            {POWERED_KWH} kWh a day (made up for the game). The water wheel makes {WHEEL_KWH} kWh a day, day and night (made up for the
            game). When there is not enough, the machines go without first, then the lights. A battery that runs flat while nobody is
            playing only slows the machines: nothing breaks and nothing is lost.
          </li>
          {LAND_SOURCES.map((source) => (
            <li key={source.what}>
              {source.what}: {source.says} {source.from}.
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 py-1.5 max-sm:grid-cols-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular text-ink">{children}</dd>
    </div>
  );
}
