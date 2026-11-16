/**
 * Averages for a place: the climate month by month (NASA POWER), and the sunshine a solar
 * panel gets (PVGIS), which is the figure the power planner asks for as "peak sun hours".
 */
import { type ClimateData, type KeptCopy, MONTH_NAMES, type SolarData, type WeatherSourceInfo } from "@outpost/shared";
import { Button } from "@/components/ui/button";
import { AgeLine, Credit } from "./age-line";
import { type TempUnit, tempText } from "./words";

const cell = "py-1.5 pr-3";
const one = (value: number | null, digits = 1) => (value === null ? "–" : value.toFixed(digits));

export function ClimateView({
  climate,
  solar,
  sources,
  now,
  temp,
  onFetch,
  fetching,
}: {
  climate: KeptCopy<"climate"> | null;
  solar: KeptCopy<"solar"> | null;
  sources: WeatherSourceInfo[];
  now: number;
  temp: TempUnit;
  onFetch: () => void;
  fetching: boolean;
}) {
  const fetchButton = (
    <Button onClick={onFetch} loading={fetching}>
      {climate || solar ? "Fetch the averages again" : "Fetch the averages for this place"}
    </Button>
  );
  if (!climate && !solar) {
    return (
      <div className="grid gap-3">
        <p className="max-w-[60ch] text-body text-ink">
          Monthly averages of temperature, rain, wind and sunshine for this place, and the sunshine a solar panel gets in each month. They
          change over decades, so they are fetched once, on a press of their own: about 12 kB from NASA POWER and PVGIS.
        </p>
        <div>{fetchButton}</div>
      </div>
    );
  }
  const climateData = climate?.data as ClimateData | undefined;
  const solarData = solar?.data as SolarData | undefined;
  return (
    <div className="grid gap-10">
      {climate && climateData ? (
        <section aria-labelledby="climate-heading">
          <h3 id="climate-heading" className="text-body font-semibold text-ink">
            The climate, month by month
          </h3>
          <p className="mb-3 text-small text-ink-muted">
            Averages over {climateData.period}, on NASA POWER's grid (about 50 km), not a weather station's record. Rain is a day's average
            times the days in the month. Sunshine is on level ground.
          </p>
          <AgeLine copy={climate} source={sources.find((source) => source.id === "nasa-power")} now={now} />
          <div className="overflow-x-auto">
            <table className="tabular w-full text-small">
              <caption className="sr-only">Monthly climate averages</caption>
              <thead className="text-left text-ink-muted">
                <tr>
                  <th scope="col" className={`${cell} font-normal`}>
                    Month
                  </th>
                  <th scope="col" className={`${cell} font-normal`}>
                    Mean temp.
                  </th>
                  <th scope="col" className={`${cell} font-normal`}>
                    Rain, mm
                  </th>
                  <th scope="col" className={`${cell} font-normal`}>
                    Wind, m/s
                  </th>
                  <th scope="col" className="py-1.5 font-normal">
                    Sun, kWh/m² a day
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {climateData.months.map((month, index) => (
                  <tr key={MONTH_NAMES[index]}>
                    <th scope="row" className={`${cell} text-left font-normal text-ink`}>
                      {MONTH_NAMES[index]}
                    </th>
                    <td className={`${cell} text-ink`}>{tempText(month.meanC, temp)}</td>
                    <td className={`${cell} text-ink`}>{one(month.precipMmMonth, 0)}</td>
                    <td className={`${cell} text-ink`}>{one(month.windMs)}</td>
                    <td className="py-1.5 text-ink">{one(month.sunKwhLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Credit source={sources.find((source) => source.id === "nasa-power")} />
        </section>
      ) : null}
      {solar && solarData ? (
        <section aria-labelledby="solar-heading">
          <h3 id="solar-heading" className="text-body font-semibold text-ink">
            Sunshine on a solar panel: peak sun hours
          </h3>
          <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
            kWh/m² a day, averaged over {solarData.firstYear} to {solarData.lastYear} from {solarData.databases}. One kWh/m² a day is one
            peak sun hour. "Best tilt" is a panel facing south at {solarData.optimalSlope ?? "the"}°, the angle PVGIS found best over the
            year; shading by buildings and trees nearby is not counted. These are the figures Tools → Power and batteries asks for.
          </p>
          <AgeLine copy={solar} source={sources.find((source) => source.id === "pvgis")} now={now} />
          <div className="overflow-x-auto">
            <table className="tabular w-full text-small">
              <caption className="sr-only">Peak sun hours by month</caption>
              <thead className="text-left text-ink-muted">
                <tr>
                  <th scope="col" className={`${cell} font-normal`}>
                    Month
                  </th>
                  <th scope="col" className={`${cell} font-normal`}>
                    Best tilt
                  </th>
                  <th scope="col" className="py-1.5 font-normal">
                    Level
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {solarData.optimal.map((value, index) => (
                  <tr key={MONTH_NAMES[index]}>
                    <th scope="row" className={`${cell} text-left font-normal text-ink`}>
                      {MONTH_NAMES[index]}
                    </th>
                    <td className={`${cell} text-ink`}>{one(value, 2)}</td>
                    <td className="py-1.5 text-ink">{one(solarData.level[index] ?? null, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Credit source={sources.find((source) => source.id === "pvgis")} />
        </section>
      ) : null}
      <div>{fetchButton}</div>
    </div>
  );
}
