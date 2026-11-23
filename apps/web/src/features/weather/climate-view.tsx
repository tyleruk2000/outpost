/**
 * Averages for a place: the climate month by month (NASA POWER), and the sunshine a solar
 * panel gets (PVGIS), which is the figure the power planner asks for as "peak sun hours".
 */
import { type ClimateData, type KeptCopy, MONTH_NAMES, type SolarData, type WeatherSourceInfo } from "@outpost/shared";
import { Button } from "@/components/ui/button";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { AgeLine, Credit } from "./age-line";
import { type TempUnit, tempText } from "./words";

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
          <Table label="Monthly climate averages">
            <TableHead>
              <Tr>
                <Th>Month</Th>
                <Th numeric>Mean temp.</Th>
                <Th numeric>Rain, mm</Th>
                <Th numeric>Wind, m/s</Th>
                <Th numeric>Sun, kWh/m² a day</Th>
              </Tr>
            </TableHead>
            <tbody>
              {climateData.months.map((month, index) => (
                <Tr key={MONTH_NAMES[index]}>
                  <Th scope="row" className="font-normal text-ink">
                    {MONTH_NAMES[index]}
                  </Th>
                  <Td numeric>{tempText(month.meanC, temp)}</Td>
                  <Td numeric>{one(month.precipMmMonth, 0)}</Td>
                  <Td numeric>{one(month.windMs)}</Td>
                  <Td numeric>{one(month.sunKwhLevel)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
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
          <Table label="Peak sun hours by month" className="max-w-md">
            <TableHead>
              <Tr>
                <Th>Month</Th>
                <Th numeric>Best tilt</Th>
                <Th numeric>Level</Th>
              </Tr>
            </TableHead>
            <tbody>
              {solarData.optimal.map((value, index) => (
                <Tr key={MONTH_NAMES[index]}>
                  <Th scope="row" className="font-normal text-ink">
                    {MONTH_NAMES[index]}
                  </Th>
                  <Td numeric>{one(value, 2)}</Td>
                  <Td numeric>{one(solarData.level[index] ?? null, 2)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Credit source={sources.find((source) => source.id === "pvgis")} />
        </section>
      ) : null}
      <div>{fetchButton}</div>
    </div>
  );
}
