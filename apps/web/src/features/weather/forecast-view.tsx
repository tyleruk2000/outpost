/** The forecast for one place: the days ahead in words and a table, and the temperature through the hours. */
import { type ForecastData, freshness, type KeptCopy, type WeatherSourceInfo, weatherWords } from "@outpost/shared";
import { ChartFrame } from "@/features/propagation/charts";
import { formatTimeOfDay } from "@/lib/clock";
import { AgeLine, Credit } from "./age-line";
import { TimeLine } from "./time-chart";
import { dayName, daySentence, daysAhead, hoursAhead, type TempUnit, tempText, tempValue, type WindUnit, windText } from "./words";

export function ForecastView({
  copy,
  source,
  now,
  wind,
  temp,
}: {
  copy: KeptCopy<"forecast">;
  source: WeatherSourceInfo | undefined;
  now: number;
  wind: WindUnit;
  temp: TempUnit;
}) {
  const data = copy.data as ForecastData;
  const state = freshness(copy, now).state;
  const hours = hoursAhead(data.hours, now);
  const days = daysAhead(data.days, now);
  return (
    <div>
      <AgeLine copy={copy} source={source} now={now} />
      <p className="mb-4 text-small text-ink-muted">
        {data.service}: {data.model}. For the model's grid point at {data.gridLat.toFixed(2)}, {data.gridLon.toFixed(2)}
        {data.elevation !== null ? `, ${Math.round(data.elevation)} m above sea level` : ""}.
      </p>
      {state === "ran-out" || hours.length === 0 ? (
        <p className="text-body text-ink">Nothing in this forecast is still ahead. Update it to see what is expected.</p>
      ) : (
        <>
          <ul className="divide-y divide-border border-y border-border" aria-label="The days ahead">
            {days.map((day) => (
              <li key={day.date} className="py-3">
                <p className="font-semibold text-ink">{dayName(day.date)}</p>
                <p className="mt-0.5 text-body text-ink">{daySentence(day, wind, temp)}</p>
              </li>
            ))}
          </ul>
          <ChartFrame
            className="mt-8"
            title="Temperature through the hours ahead"
            reading={`From ${tempText(Math.min(...hours.map((hour) => hour.tempC ?? 99)), temp)} to ${tempText(Math.max(...hours.map((hour) => hour.tempC ?? -99)), temp)}.`}
          >
            <TimeLine
              name="Forecast temperature"
              points={hours.filter((hour) => hour.tempC !== null).map((hour) => ({ t: hour.t, value: tempValue(hour.tempC!, temp) }))}
              format={(value) => `${Math.round(value)}°`}
            />
          </ChartFrame>
          <details className="mt-6">
            <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">Every hour, as a table</summary>
            <div className="overflow-x-auto">
              <table className="tabular w-full text-small">
                <caption className="sr-only">The forecast hour by hour</caption>
                <thead className="text-left text-ink-muted">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-normal">
                      Hour
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-normal">
                      Weather
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-normal">
                      Temp.
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-normal">
                      Rain
                    </th>
                    <th scope="col" className="py-1.5 font-normal">
                      Wind, gusts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hours.map((hour) => (
                    <tr key={hour.t}>
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal whitespace-nowrap text-ink">
                        {new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(hour.t)} {formatTimeOfDay(hour.t)}
                      </th>
                      <td className="py-1.5 pr-3 text-ink">{weatherWords(hour.code)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-ink">{tempText(hour.tempC, temp)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-ink">
                        {hour.precipMm === null ? "–" : `${hour.precipMm.toFixed(1)} mm`}
                        {hour.precipChance !== null ? `, ${Math.round(hour.precipChance)}%` : ""}
                      </td>
                      <td className="py-1.5 whitespace-nowrap text-ink">
                        {windText(hour.windKmh, wind)}, {windText(hour.gustKmh, wind)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <Credit source={source} />
    </div>
  );
}
