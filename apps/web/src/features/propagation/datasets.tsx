/**
 * The engine and the data a prediction rests on: what is installed, where it came from
 * and when, whether it still matches its checksums, fetching VOACAP's coefficients
 * (which Outpost does not ship) or removing them, and fetching a newer solar cycle table.
 */
import { formatBytes, type PropagationDataset } from "@outpost/shared";
import { useState } from "react";
import { ErrorState, Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Select, Skeleton } from "@/components/ui/misc";
import { ScrollBox } from "@/features/radio/scroll-box";
import { useStorage } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { useDatasets, useDownloadSolar, useEngines } from "./data";
import { EngineDataLine, RemoveEngineData } from "./engine-data";

function DatasetRow({ dataset, action }: { dataset: PropagationDataset; action?: React.ReactNode }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[75ch]">
          <p className="flex flex-wrap items-center gap-2 text-ink">
            {dataset.title}
            <Badge tone={dataset.verified === false || !dataset.installed ? "danger" : "neutral"}>
              {dataset.verified === false ? "Damaged" : !dataset.installed ? "Missing" : dataset.where}
            </Badge>
          </p>
          <p className="mt-0.5 text-small text-ink-muted">{dataset.description}</p>
          <p className="tabular mt-1 text-small text-ink-muted">
            {[
              dataset.version ? `Version ${dataset.version}` : null,
              dataset.bytes !== null ? formatBytes(dataset.bytes) : null,
              dataset.files !== null ? `${dataset.files} file${dataset.files === 1 ? "" : "s"}` : null,
              dataset.verified ? "checksums match" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {dataset.note ? (
            <p
              className={
                dataset.verified === false || !dataset.installed ? "mt-1 text-small text-danger" : "mt-1 text-small text-ink-muted"
              }
            >
              {dataset.note}
            </p>
          ) : null}
          <p className="mt-1 text-small text-ink-muted">Terms: {dataset.licence}</p>
          {dataset.source ? <p className="mt-0.5 font-mono text-micro break-all text-ink-muted">{dataset.source}</p> : null}
          {dataset.sha256 ? <p className="mt-0.5 font-mono text-micro break-all text-ink-muted">sha256 {dataset.sha256}</p> : null}
        </div>
        {action}
      </div>
    </li>
  );
}

export function Datasets() {
  const engines = useEngines();
  const datasets = useDatasets();
  const locations = useStorage();
  const download = useDownloadSolar();
  const [locationId, setLocationId] = useState<string | undefined>(undefined);

  if (datasets.isPending || engines.isPending) return <Skeleton className="h-48 w-full" />;
  if (datasets.isError) return <ErrorState error={datasets.error} onRetry={() => datasets.refetch()} />;
  const engine = engines.data?.[0];
  const available = (locations.data?.locations ?? []).filter((location) => location.status === "available");
  const chosen = locationId ?? available.find((location) => location.isDefault)?.id ?? available[0]?.id;
  const { solar } = datasets.data;

  return (
    <div>
      <Section
        title="Engine"
        description="Outpost has no propagation model of its own. This is the program that works the predictions out."
      >
        {engine ? (
          <Rows className="border-y border-border">
            <li className="py-3">
              <p className="flex flex-wrap items-center gap-2 text-ink">
                {engine.model || engine.name}
                <Badge tone={engine.ready ? "neutral" : "danger"}>{engine.ready ? "Ready" : "Cannot run"}</Badge>
              </p>
              <p className="mt-0.5 max-w-[75ch] text-small text-ink-muted">
                VOACAP, the Voice of America Coverage Analysis Program, written by the United States Institute for Telecommunication
                Sciences. Run here by {engine.implementation || "its Rust translation"} ({engine.licence}), from {engine.minMhz} to{" "}
                {engine.maxMhz} MHz.
              </p>
              {engine.problem ? <p className="mt-1 text-small text-danger">{engine.problem}</p> : null}
              {engine.sha256 ? <p className="mt-0.5 font-mono text-micro break-all text-ink-muted">sha256 {engine.sha256}</p> : null}
            </li>
          </Rows>
        ) : null}
      </Section>

      <Section
        title="Data"
        description="The solar table ships with Outpost and goes out of date. VOACAP's coefficients do not ship: they are downloaded once, and never go out of date."
      >
        {engine?.data && !engine.data.installed ? <EngineDataLine data={engine.data} className="mb-4" /> : null}
        <Rows className="border-y border-border">
          {datasets.data.datasets.map((dataset) => (
            <DatasetRow
              key={dataset.id}
              dataset={dataset}
              action={
                dataset.id === "voacap-coefficients" ? (
                  engine?.data?.installed ? (
                    <RemoveEngineData data={engine.data} />
                  ) : undefined
                ) : dataset.downloadable ? (
                  <div className="grid w-full gap-2 sm:w-64">
                    {available.length > 1 ? (
                      <Select
                        aria-label="Where to keep the downloaded table"
                        value={chosen}
                        onChange={setLocationId}
                        options={available.map((location) => ({ value: location.id, label: location.name }))}
                      />
                    ) : null}
                    <Button loading={download.isPending} onClick={() => download.mutate(chosen)}>
                      Download a newer table
                    </Button>
                    <p className="text-small text-ink-muted">Fetched from NOAA when you press this, and at no other time.</p>
                  </div>
                ) : undefined
              }
            />
          ))}
        </Rows>
        {solar.ageDays > 45 ? (
          <Notice tone="warning" className="mt-4" title={`The solar table is ${solar.ageDays} days old`}>
            Predictions still work, and say that the forecast behind their sunspot number is old. NOAA revises the forecast every month; a
            newer table, or a sunspot number of your own, will be closer.
          </Notice>
        ) : null}
      </Section>

      <Section
        title="The solar table in use"
        description={`Dated ${formatDate(Date.parse(`${solar.dataDate}T12:00:00Z`))}, ${solar.origin === "included" ? "included with Outpost" : "downloaded"}. NOAA's forecast of the smoothed sunspot number, with the low and high figures it gives.`}
      >
        <ScrollBox label="The solar table in use, by month" className="max-h-72 overflow-auto rounded-panel border border-border">
          <table className="tabular w-full text-small">
            <thead className="sticky top-0 bg-surface text-left text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Month
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sunspot number
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Low
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  High
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {solar.months.map((month) => (
                <tr key={month.month}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink">
                    {month.month}
                  </th>
                  <td className="px-3 py-1.5 text-right text-ink">{month.ssn.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right text-ink-muted">{month.low?.toFixed(1) ?? "–"}</td>
                  <td className="px-3 py-1.5 text-right text-ink-muted">{month.high?.toFixed(1) ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      </Section>

      <Section title="Looked at and not offered">
        <Rows className="border-y border-border">
          {datasets.data.notOffered.map((item) => (
            <li key={item.title} className="py-2.5">
              <span className="block text-ink">{item.title}</span>
              <span className="block max-w-[75ch] text-small text-ink-muted">{item.reason}</span>
            </li>
          ))}
        </Rows>
      </Section>
    </div>
  );
}
