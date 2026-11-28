/**
 * Routes from your own file: a step of Add a place that builds a road network from an
 * OpenStreetMap source file (`.osm.pbf`) already in one of the storage locations, as
 * `POST /api/roads/networks` with a location and a path. Nothing is downloaded; the file
 * stays where it is, and only the routes (about 1–2% of its size) are written.
 */
import { CircleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { useInstallRoadNetwork } from "../road-route/data";

/** "kent" from "maps/kent-latest.osm.pbf": a name to start from. */
export function nameFromPath(relPath: string): string {
  const file = relPath.split(/[\\/]/).at(-1) ?? "";
  const stem = file
    .replace(/\.osm\.pbf$/i, "")
    .replace(/\.pbf$/i, "")
    .replace(/-(latest|\d{6})$/i, "");
  const words = stem.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** What is wrong with the form, in words, or null when it can be sent. */
export function ownFileProblem(input: { locationId: string | undefined; relPath: string; name: string; country: string }): string | null {
  if (!input.locationId) return "Choose the storage location the file is in.";
  const path = input.relPath.trim();
  if (!path) return "Give the file's path in that location.";
  if (!/\.pbf$/i.test(path)) return "Give an OpenStreetMap source file, ending .osm.pbf.";
  if (!input.name.trim()) return "Give the routes a name.";
  if (input.country.trim() && !/^[A-Za-z]{2}$/.test(input.country.trim()))
    return "Give the country as two letters, such as FR, or leave it empty.";
  return null;
}

export function OwnRoadsFile({ heading, onBack, onDone }: { heading: ReactNode; onBack: () => void; onDone: () => void }) {
  const storage = useStorage();
  const install = useInstallRoadNetwork();
  const locations = storage.data?.locations ?? [];
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  // Where the file can be read now: the default location if it is connected, else the first that is.
  const connected = locations.filter((location) => location.status === "available");
  const chosen = locationId ?? connected.find((location) => location.isDefault)?.id ?? connected[0]?.id;
  const [relPath, setRelPath] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [tried, setTried] = useState(false);
  const shownName = name || nameFromPath(relPath);
  const problem = ownFileProblem({ locationId: chosen, relPath, name: shownName, country });

  const build = async () => {
    setTried(true);
    if (problem || !chosen) return;
    try {
      await install.mutateAsync({
        locationId: chosen,
        relPath: relPath.trim().replace(/^[\\/]+/, ""),
        name: shownName.trim(),
        country: country.trim() ? country.trim().toUpperCase() : null,
      });
      toast.success(`Building routes for ${shownName.trim()}`, { description: "Follow it in Downloads and tasks." });
      onDone();
    } catch {
      // Said below the form.
    }
  };

  return (
    <>
      <DialogBody className="grid content-start gap-4">
        {heading}
        <p className="max-w-[60ch] text-small text-ink-muted">
          Routes built from an OpenStreetMap source file (.osm.pbf) you already have in storage. Nothing is downloaded. Your file stays
          where it is, untouched; the routes take about 1–2% of its size.
        </p>
        {storage.isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : storage.isError ? (
          <Notice tone="danger" icon={<CircleAlert />} title="Could not list the storage locations">
            {errorMessage(storage.error)}
          </Notice>
        ) : locations.length === 0 ? (
          <Notice title="No storage locations yet">Add one under Storage, put the file in it, then come back.</Notice>
        ) : (
          <>
            <Field label="Storage location">
              {(ids) => (
                <Select
                  {...ids}
                  value={chosen}
                  onChange={setLocationId}
                  options={locations.map((location) => ({
                    value: location.id,
                    label: location.name,
                    disabled: location.status !== "available",
                    ...(location.status !== "available" ? { description: "Not connected" } : {}),
                  }))}
                />
              )}
            </Field>
            <Field label="Path in that location" hint="As it is in the location, such as maps/kent-latest.osm.pbf.">
              {(ids) => (
                <Input
                  {...ids}
                  value={relPath}
                  spellCheck={false}
                  autoCapitalize="off"
                  onChange={(event) => setRelPath(event.target.value)}
                />
              )}
            </Field>
            <Field label="Name">
              {(ids) => (
                <Input {...ids} value={name} placeholder={nameFromPath(relPath)} onChange={(event) => setName(event.target.value)} />
              )}
            </Field>
            <Field label="Country" optional hint="Two letters, such as FR: which country's roads these are, for routes across borders.">
              {(ids) => <Input {...ids} value={country} maxLength={2} onChange={(event) => setCountry(event.target.value)} />}
            </Field>
          </>
        )}
        {install.isError ? (
          <Notice tone="danger" icon={<CircleAlert />} title="Could not build the routes">
            {errorMessage(install.error)}
          </Notice>
        ) : null}
      </DialogBody>
      <DialogFooter>
        {tried && problem ? <span className="mr-auto text-small text-ink-muted">{problem}</span> : null}
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={() => void build()} disabled={install.isPending || locations.length === 0}>
          Build routes
        </Button>
      </DialogFooter>
    </>
  );
}
