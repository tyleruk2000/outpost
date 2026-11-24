/**
 * Layer data on this device is nearby places: a country's, read from its source file, and the
 * worldwide sets under World basics, all added, updated and removed on Offline maps like the
 * rest of the map data (Add a place › Nearby places › Which kinds). What stays here is the
 * import of a file a person obtained (an official shelter register, emergency planning zones,
 * historical records), and the short section that leads to Offline maps.
 */
import { type JobDto, REFERENCE_LAYER_INFO, type ReferenceImportFormat } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import type { MapEngine } from "@/features/maps/map/engine";
import { PanelHeading } from "@/features/maps/ui";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatNumber, plural } from "@/lib/utils";
import { layersKeys, usePacks } from "./data";

const FORMATS: Array<{ value: ReferenceImportFormat; label: string; about: string }> = [
  {
    value: "features-csv",
    label: "Places (CSV)",
    about:
      "One place a row: name, position, layer, provenance, publisher, licence and accuracy. Positions in degrees, or in another system named below.",
  },
  {
    value: "geojson",
    label: "Points, lines or areas (GeoJSON)",
    about: "An emergency planning zone, a register of shelters. Who published it and under what licence is said once, below.",
  },
  {
    value: "historical-csv",
    label: "Historical records (CSV)",
    about:
      "Every row says whether it is an actual historical target list, a historical assessment of likely targets, or an author's speculation, with its document, period, evidence and citations.",
  },
  {
    value: "country-figures-csv",
    label: "Country figures (CSV)",
    about: "A country-level figure from a published report, with its title, publisher, year and page.",
  },
  {
    value: "osm-pbf",
    label: "OpenStreetMap source file (.osm.pbf)",
    about: "A Geofabrik source file you downloaded. Over 32 MB, put it in a storage location first.",
  },
  {
    value: "worldpop-tif",
    label: "Population grid from WorldPop (GeoTIFF)",
    about:
      "WorldPop's 2020 population counts at 1 km, unconstrained and UN-adjusted, as downloaded from its site (named like gbr_ppp_2020_1km_Aggregated_UNadj.tif). Credited with WorldPop's citation, CC BY 4.0. Another product is refused rather than credited wrongly.",
  },
];

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient();
  const [format, setFormat] = useState<ReferenceImportFormat>("features-csv");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<Record<string, string>>({ provenance: "public-record" });
  const [jobId, setJobId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const job = useQuery({
    queryKey: ["jobs", jobId],
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${jobId}`).then((data) => data.job),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data && ["succeeded", "failed", "cancelled"].includes(query.state.data.state) ? false : 700),
  });
  const done = job.data && ["succeeded", "failed", "cancelled"].includes(job.data.state);
  useEffect(() => {
    if (job.data?.state === "succeeded") client.invalidateQueries({ queryKey: layersKeys.all });
  }, [job.data?.state, client]);
  const about = FORMATS.find((entry) => entry.value === format)!;
  const option = (key: string) => options[key] ?? "";
  const setOption = (key: string, value: string) => setOptions((current) => ({ ...current, [key]: value }));
  const result = job.data?.result as { imported?: number; skipped?: number; duplicates?: number; problems?: string[] } | null | undefined;
  const reset = () => {
    setJobId(null);
    setFile(null);
    setTitle("");
  };

  const send = async () => {
    if (!file) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("format", format);
      form.set("title", title.trim() || file.name);
      form.set("options", JSON.stringify(Object.fromEntries(Object.entries(options).filter(([, value]) => value.trim()))));
      form.set("file", file);
      const started = await api.upload<{ jobId: string }>("/api/reference/imports", form);
      setJobId(started.jobId);
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const text = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {(ids) => <Input {...ids} value={option(key)} onChange={(event) => setOption(key, event.target.value)} />}
    </Field>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Import a file"
        description="A file you obtained from its publisher. Every record keeps who published it and under what licence."
        size="lg"
      >
        <DialogBody className="grid gap-4">
          {jobId ? (
            !done ? (
              <p className="text-small text-ink" aria-live="polite">
                {job.data?.progress.message ?? "Importing"}…
              </p>
            ) : job.data?.state === "succeeded" ? (
              <div className="grid gap-2">
                <Notice tone="success">
                  Imported {formatNumber(result?.imported ?? 0)}
                  {result?.skipped ? `; ${formatNumber(result.skipped)} left out` : ""}
                  {result?.duplicates ? `; ${formatNumber(result.duplicates)} already held from another source` : ""}.
                </Notice>
                {result?.problems?.length ? (
                  <ul className="list-disc pl-5 text-small text-ink-muted">
                    {result.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <Notice tone="danger">{job.data?.error ?? "The import did not finish."}</Notice>
            )
          ) : (
            <>
              <Field label="Kind of file">
                {(ids) => (
                  <Select
                    {...ids}
                    value={format}
                    onChange={(value) => setFormat(value)}
                    options={FORMATS.map(({ value, label }) => ({ value, label }))}
                  />
                )}
              </Field>
              <p className="text-small text-ink-muted">
                {about.about}{" "}
                {format.endsWith("-csv") ? (
                  <a href={`/api/reference/templates/${format}.csv`} className="text-primary underline underline-offset-2">
                    The columns, as a template
                  </a>
                ) : null}
              </p>
              <Field label="File">
                {(ids) => (
                  <Input
                    {...ids}
                    type="file"
                    accept={
                      format === "geojson"
                        ? ".geojson,.json"
                        : format === "osm-pbf"
                          ? ".pbf"
                          : format === "worldpop-tif"
                            ? ".tif,.tiff"
                            : ".csv,.txt"
                    }
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                )}
              </Field>
              <Field label="Name" optional>
                {(ids) => (
                  <Input {...ids} value={title} placeholder={file?.name ?? ""} onChange={(event) => setTitle(event.target.value)} />
                )}
              </Field>
              {format === "geojson" || format === "features-csv" ? (
                <>
                  {format === "geojson" ? (
                    <Field label="Layer">
                      {(ids) => (
                        <Select
                          {...ids}
                          value={option("layer") || undefined}
                          placeholder="Choose a layer"
                          onChange={(value) => setOption("layer", value)}
                          options={(["shelters", "planning-zones", "military", "nuclear", "hospitals", "emergency"] as const).map(
                            (layer) => ({
                              value: layer,
                              label: REFERENCE_LAYER_INFO[layer].label,
                            }),
                          )}
                        />
                      )}
                    </Field>
                  ) : null}
                  <Field
                    label="Provenance"
                    hint="A published record names its publisher and licence. Anything else is imported as unverified."
                  >
                    {(ids) => (
                      <Select
                        {...ids}
                        value={option("provenance") || "public-record"}
                        onChange={(value) => setOption("provenance", value)}
                        options={[
                          { value: "public-record", label: "A published public record" },
                          { value: "unverified", label: "Unverified or speculative" },
                        ]}
                      />
                    )}
                  </Field>
                  {text("publisher", "Published by", format === "features-csv" ? "Used where a row gives none." : undefined)}
                  {text("license", "Licence", "As the publisher states it, for example Open Government Licence v3.0.")}
                  {text("accuracy", "How exactly it is placed", "For example: to the building; as drawn by the council.")}
                  {text("sourceUrl", "Where it was published")}
                  {text("publishedAt", "Publication date")}
                  {text(
                    "crs",
                    "Coordinate system, if not latitude and longitude",
                    "EPSG:27700 (British National Grid), EPSG:2056 (Swiss), EPSG:3857. Others are refused.",
                  )}
                </>
              ) : null}
              {format === "osm-pbf" || format === "worldpop-tif"
                ? text(
                    "country",
                    "Country code",
                    format === "osm-pbf" ? "Two letters, such as LI." : "Two letters, such as GB: the country the grid is for.",
                  )
                : null}
              {format === "osm-pbf" ? (
                <fieldset className="grid gap-1">
                  <legend className="text-small font-medium text-ink">Also read</legend>
                  {(["routes", "rights-of-way"] as const).map((layer) => {
                    const chosen = option("lines").split(",").filter(Boolean);
                    return (
                      <div key={layer} className="flex min-h-11 items-center gap-2 md:min-h-8">
                        <Checkbox
                          id={`import-line-${layer}`}
                          checked={chosen.includes(layer)}
                          onCheckedChange={(on) =>
                            setOption("lines", (on ? [...chosen, layer] : chosen.filter((entry) => entry !== layer)).join(","))
                          }
                        />
                        <label htmlFor={`import-line-${layer}`} className="text-small text-ink">
                          {REFERENCE_LAYER_INFO[layer].label}
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {jobId && done ? (
            <Button onClick={reset}>Import another</Button>
          ) : (
            <Button variant="primary" onClick={send} loading={sending} disabled={!file || jobId !== null}>
              <FileUp /> Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Layer data, where a screen shows the layers (the nuclear screen): what is held, and the way to Offline maps. */
export function ReferenceDataSection(_: { engine?: MapEngine | null }) {
  const packs = usePacks();
  const [importing, setImporting] = useState(false);
  const held = packs.data ?? [];
  const records = held.reduce((sum, pack) => sum + pack.records, 0);
  return (
    <section className="grid gap-2" aria-label="Layer data for the map" id="reference-data">
      <PanelHeading>Layer data for the map</PanelHeading>
      <p className="max-w-[70ch] text-small text-ink-muted">
        Hospitals, shelters, food and supplies and the rest are a country's nearby places; borders, airports and towns are World basics.
        Both are added, updated and removed on Offline maps. Planning zones and historical records are files you import.
      </p>
      {packs.isPending ? (
        <Skeleton className="h-5 w-48" />
      ) : packs.isError ? (
        <ErrorState error={packs.error} onRetry={() => packs.refetch()} />
      ) : (
        <p className="tabular text-small text-ink">
          {held.length === 0
            ? "None on this device yet."
            : `${plural(held.length, "set")} on this device, ${formatNumber(records)} records.`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="primary">
          <Link to="/maps/data">
            Offline maps <ChevronRight />
          </Link>
        </Button>
        <Button onClick={() => setImporting(true)}>
          <FileUp /> Import a file
        </Button>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </section>
  );
}
