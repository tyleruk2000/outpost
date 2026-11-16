/**
 * Reference data on this device: the packs installed, getting more by source, country or
 * the area on screen with the size shown before anything starts, importing a file a
 * person obtained, and the sources that are linked rather than downloaded. Downloads go
 * through the download manager; nothing is fetched until Download is pressed.
 */
import {
  formatBytes,
  type JobDto,
  REFERENCE_LAYER_INFO,
  type ReferenceEstimate,
  type ReferenceEstimateRequest,
  type ReferenceImportFormat,
  type ReferenceLayerId,
  type ReferencePackDto,
  type ReferenceProviderDto,
} from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, Ellipsis, ExternalLink, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Checkbox, Select, Skeleton } from "@/components/ui/misc";
import type { MapEngine } from "@/features/maps/map/engine";
import { DestinationPicker, useDestination } from "@/features/maps/panels/destination";
import { PanelHeading } from "@/features/maps/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatNumber, plural } from "@/lib/utils";
import { layersKeys, useCatalogue, useEstimate, usePacks, useRemovePack, useStartDownloads } from "./data";

const layerNames = (layers: ReferenceLayerId[]) => layers.map((layer) => REFERENCE_LAYER_INFO[layer].label.toLowerCase()).join(", ");

function PackRow({ pack, onUpdate }: { pack: ReferencePackDto; onUpdate: (request: ReferenceEstimateRequest) => void }) {
  const [removing, setRemoving] = useState(false);
  const remove = useRemovePack();
  const trouble = !pack.available
    ? "The drive holding its file is not connected"
    : pack.status === "missing"
      ? "Its file is missing"
      : pack.status === "damaged"
        ? "Its file is damaged"
        : null;
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-title text-body text-ink">{pack.title}</h4>
          <p className="tabular mt-0.5 text-small text-ink-muted">
            {pack.provider === "worldpop"
              ? "Population grid"
              : `${formatNumber(pack.records + pack.figures)} ${pack.figures > 0 && pack.records === 0 ? "figures" : "records"}`}
            {pack.duplicates > 0 ? `, ${formatNumber(pack.duplicates)} also in another pack` : ""}
            {pack.layers.length > 0 ? `: ${layerNames(pack.layers)}` : ""}
          </p>
          <p className="tabular text-small text-ink-muted">
            {pack.providerName}, {pack.license}
            {pack.publishedAt ? `, data of ${pack.publishedAt}` : ""}, fetched {formatDate(pack.retrievedAt)}, {formatBytes(pack.sizeBytes)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
            {pack.origin === "import" ? "Imported, kept" : "Kept"} on {pack.locationName}
            {trouble ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> {trouble}
              </Badge>
            ) : null}
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${pack.title}`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={pack.origin !== "download" || !pack.request} onSelect={() => pack.request && onUpdate(pack.request)}>
              <RefreshCw /> Check for an update
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setRemoving(true)}>
              <Trash2 /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove “${pack.title}”?`}
        description={
          pack.origin === "download"
            ? "Its records leave the map and the file Outpost downloaded is deleted. It can be downloaded again."
            : "Its records leave the map. The file you imported is left where it is."
        }
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: pack.id, deleteFiles: pack.origin === "download" },
            {
              onSuccess: () => {
                setRemoving(false);
                toast.success(`Removed “${pack.title}”.`);
              },
            },
          )
        }
      />
    </li>
  );
}

function EstimateResult({ estimate, onDone }: { estimate: ReferenceEstimate; onDone: () => void }) {
  const [chosen, setChosen] = useState<string[]>(() => estimate.items.map((item) => item.key));
  const items = estimate.items.filter((item) => chosen.includes(item.key));
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const destination = useDestination(bytes);
  const start = useStartDownloads();
  if (estimate.items.length === 0) {
    return <Notice tone="info">{estimate.notes.join(" ") || "That source has nothing for what you chose."}</Notice>;
  }
  return (
    <div className="grid gap-3">
      {estimate.notes.map((note) => (
        <Notice key={note} tone={/illegal/.test(note) ? "warning" : "info"} icon={/illegal/.test(note) ? <CircleAlert /> : undefined}>
          {note}
        </Notice>
      ))}
      <ul className="divide-y divide-border border-y border-border" aria-label="What would be downloaded">
        {estimate.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-2.5">
            <Checkbox
              id={`item-${item.key}`}
              checked={chosen.includes(item.key)}
              onCheckedChange={(on) => setChosen((current) => (on ? [...current, item.key] : current.filter((key) => key !== item.key)))}
              className="mt-0.5"
            />
            <label htmlFor={`item-${item.key}`} className="min-w-0 flex-1">
              <span className="block text-small font-medium text-ink">{item.title}</span>
              <span className="tabular block text-small text-ink-muted">
                {item.exact ? "" : "About "}
                {formatBytes(item.bytes)} from {item.host}
                {item.records !== null ? `, ${formatNumber(item.records)} records` : ""}
                {item.replaces ? ". Replaces the pack installed" : ""}
              </span>
              <span className="block text-micro text-ink-muted">{item.basis}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="tabular text-small text-ink">
        {items.length === 0
          ? "Choose at least one."
          : `${plural(items.length, "file")} to download, ${items.every((item) => item.exact) ? "" : "about "}${formatBytes(bytes)}, and about ${formatBytes(
              estimate.databaseBytes,
            )} in Outpost's database.`}
      </p>
      <DestinationPicker destination={destination} approximate={!items.every((item) => item.exact)} />
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={items.length === 0 || !destination.locationId}
          loading={start.isPending}
          onClick={() =>
            start.mutate(
              { estimateId: estimate.estimateId, keys: items.map((item) => item.key), locationId: destination.locationId },
              {
                onSuccess: (result) => {
                  destination.remember();
                  toast.success(`${plural(result.downloads.length, "download")} started. Progress is under Downloads.`);
                  onDone();
                },
              },
            )
          }
        >
          <Download /> Download
        </Button>
      </div>
    </div>
  );
}

function GetDialog({
  open,
  onOpenChange,
  engine,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engine: MapEngine | null;
  initial: ReferenceEstimateRequest | null;
}) {
  const catalogue = useCatalogue(open);
  const providers = (catalogue.data?.providers ?? []).filter((provider) => provider.verdict === "fetch");
  const [providerId, setProviderId] = useState<string>(initial?.provider ?? "natural-earth");
  const [scope, setScope] = useState<"country" | "bbox" | "world">(
    initial?.scope.bbox ? "bbox" : initial?.scope.countries?.length ? "country" : "country",
  );
  const [country, setCountry] = useState<string>(initial?.scope.countries?.[0] ?? "GB");
  const [layers, setLayers] = useState<ReferenceLayerId[]>(initial?.layers ?? []);
  const estimate = useEstimate();
  const provider: ReferenceProviderDto | undefined = providers.find((entry) => entry.id === providerId);

  const { mutate } = estimate;
  // An update is estimated as the dialog opens for it.
  useEffect(() => {
    if (open && initial) mutate(initial);
  }, [open, initial, mutate]);
  useEffect(() => {
    if (provider && !provider.scopes.includes(scope))
      setScope(provider.scopes[0] === "world" && provider.scopes.includes("country") ? "country" : (provider.scopes[0] as typeof scope));
  }, [provider, scope]);

  const request = (): ReferenceEstimateRequest => ({
    provider: providerId,
    scope: scope === "country" ? { countries: [country] } : scope === "bbox" && engine ? { bbox: engine.getBounds() } : {},
    ...(layers.length > 0 ? { layers } : {}),
  });
  const countries = catalogue.data?.countries ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) estimate.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Get reference data"
        description="Choose a source and an area. The size is shown before anything is downloaded."
        size="lg"
      >
        <DialogBody className="grid gap-4">
          {catalogue.isPending ? (
            <Skeleton className="h-40" />
          ) : catalogue.isError ? (
            <ErrorState error={catalogue.error} onRetry={() => catalogue.refetch()} />
          ) : (
            <>
              <Field label="Source">
                {(ids) => (
                  <Select
                    {...ids}
                    value={providerId}
                    onChange={(value) => {
                      setProviderId(value);
                      setLayers([]);
                      estimate.reset();
                    }}
                    options={providers.map((entry) => ({ value: entry.id, label: entry.name }))}
                  />
                )}
              </Field>
              {provider ? (
                <div className="grid gap-1 text-small">
                  <p className="text-ink">{provider.why}</p>
                  <p className="text-ink-muted">
                    Licence:{" "}
                    {provider.licenseUrl ? (
                      <a href={provider.licenseUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        {provider.license}
                      </a>
                    ) : (
                      provider.license
                    )}
                    . Terms read on {provider.termsRead}:{" "}
                    <a href={provider.termsUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                      {provider.termsQuote}
                    </a>
                  </p>
                  <p className="text-ink-muted">Updates: {provider.incremental}</p>
                </div>
              ) : null}
              {provider ? (
                <fieldset className="grid gap-2">
                  <legend className="text-small font-medium text-ink">Area</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {(["country", "bbox", "world"] as const)
                      .filter((option) => provider.scopes.includes(option))
                      .map((option) => (
                        <label key={option} className="flex min-h-11 items-center gap-2 text-small text-ink md:min-h-0">
                          <input type="radio" name="reference-scope" checked={scope === option} onChange={() => setScope(option)} />
                          {option === "country" ? "A country" : option === "bbox" ? "The area on screen" : "The whole world"}
                        </label>
                      ))}
                  </div>
                  {scope === "country" ? (
                    <Select
                      aria-label="Country"
                      value={country}
                      onChange={setCountry}
                      options={countries.map((entry) => ({ value: entry.code, label: entry.name }))}
                    />
                  ) : null}
                  {scope === "bbox" && !engine ? (
                    <p className="text-small text-danger">The map is not drawn, so there is no area on screen.</p>
                  ) : null}
                </fieldset>
              ) : null}
              {provider && provider.layers.length > 1 ? (
                <fieldset className="grid gap-1">
                  <legend className="text-small font-medium text-ink">Layers (none ticked means all)</legend>
                  {provider.layers.map((layer) => (
                    <div key={layer} className="flex min-h-11 items-center gap-2 md:min-h-8">
                      <Checkbox
                        id={`get-layer-${layer}`}
                        checked={layers.includes(layer)}
                        onCheckedChange={(on) =>
                          setLayers((current) => (on ? [...current, layer] : current.filter((entry) => entry !== layer)))
                        }
                      />
                      <label htmlFor={`get-layer-${layer}`} className="text-small text-ink">
                        {REFERENCE_LAYER_INFO[layer].label}
                      </label>
                    </div>
                  ))}
                </fieldset>
              ) : null}
              {provider?.caution ? (
                <Notice tone="warning" icon={<CircleAlert />}>
                  {provider.caution}
                </Notice>
              ) : null}
              <div>
                <Button
                  onClick={() => estimate.mutate(request())}
                  loading={estimate.isPending}
                  disabled={!provider || (scope === "bbox" && !engine)}
                >
                  Show the size
                </Button>
                <p className="mt-1 text-micro text-ink-muted">Showing the size asks the source and nothing else, and needs the internet.</p>
              </div>
              {estimate.isError ? <Notice tone="danger">{errorMessage(estimate.error)}</Notice> : null}
              {estimate.data ? (
                <EstimateResult key={estimate.data.estimateId} estimate={estimate.data} onDone={() => onOpenChange(false)} />
              ) : null}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

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
    label: "OpenStreetMap extract (.osm.pbf)",
    about: "A Geofabrik extract you downloaded. Over 32 MB, put it in a storage location first.",
  },
  {
    value: "worldpop-tif",
    label: "Population grid from WorldPop (GeoTIFF)",
    about:
      "WorldPop's 2020 population counts at 1 km, unconstrained and UN-adjusted, as downloaded from its site (named like gbr_ppp_2020_1km_Aggregated_UNadj.tif). Credited with WorldPop's citation, CC BY 4.0. Another product is refused rather than credited wrongly.",
  },
];

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
      toast.error(errorMessage(error));
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
              <Field label="Name">
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

export function ReferenceDataSection({ engine }: { engine: MapEngine | null }) {
  const packs = usePacks();
  const catalogue = useCatalogue();
  const [getting, setGetting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [update, setUpdate] = useState<ReferenceEstimateRequest | null>(null);
  const sorted = useMemo(() => packs.data ?? [], [packs.data]);
  return (
    <section className="grid gap-2" aria-label="Reference data for the map" id="reference-data">
      <PanelHeading>Reference data for the map</PanelHeading>
      <p className="text-small text-ink-muted">
        Boundaries, airports, publicly mapped infrastructure, shelters, population and historical records, as layers you switch on in the
        Layers tab. Each comes from a published source and keeps its licence and dates.
      </p>
      {packs.isPending ? (
        <Skeleton className="h-16" />
      ) : packs.isError ? (
        <ErrorState error={packs.error} onRetry={() => packs.refetch()} />
      ) : sorted.length === 0 ? (
        <p className="text-small text-ink">None on this device yet.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border" aria-label="Reference packs">
          {sorted.map((pack) => (
            <PackRow
              key={pack.id}
              pack={pack}
              onUpdate={(request) => {
                setUpdate(request);
                setGetting(true);
              }}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            setUpdate(null);
            setGetting(true);
          }}
        >
          <Download /> Get reference data
        </Button>
        <Button onClick={() => setImporting(true)}>
          <FileUp /> Import a file
        </Button>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-small font-medium text-ink">Sources that are linked, not downloaded</summary>
        <ul className="mt-1 divide-y divide-border">
          {(catalogue.data?.linked ?? []).map((source) => (
            <li key={source.id} className="py-2 text-small">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
              >
                {source.name} <ExternalLink aria-hidden className="size-3.5" />
              </a>
              <p className="text-ink-muted">{source.why}</p>
            </li>
          ))}
        </ul>
      </details>
      <GetDialog open={getting} onOpenChange={setGetting} engine={engine} initial={update} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </section>
  );
}
