/**
 * What a route needs, said before Plan route: the countries it runs through that have no
 * roads kept ("France has no roads yet", with one press to add exactly those), the ones on
 * their way with real progress ("France: Downloading 1.20 of 4.90 GB, 18 minutes left"),
 * and "France is ready." when one arrives. Worked out on this device from the points alone
 * (POST /api/roads/coverage), so it is there as soon as From and To are chosen.
 *
 * The state words are Map data's: Not added · Waiting · Downloading n of N, time left ·
 * Building · Ready, from <date> · Failed: <what to do>.
 */
import {
  formatBytes,
  formatDuration,
  type RoadCoverageCountry,
  type RoadCoverageResponse,
  type RoadMissingCountry,
  type RoadNetworkBuilding,
  type RoadRouteProblem,
} from "@outpost/shared";
import { CircleAlert, CircleCheck, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { ApiError } from "@/lib/api";

/** "France", "France and Switzerland", "France, Italy and Switzerland". */
export function namesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Map data's add flow for exactly these countries, with roads for routes ticked; with none, Map data itself. */
export const addRoadsLink = (codes?: readonly string[]) =>
  codes && codes.length > 0 ? `/maps/data?add=1&kinds=roads&countries=${codes.join(",")}` : "/maps/data";

/** "1.20 of 4.90 GB" (one unit when both share it), "412 MB of 1.90 GB", or "412 MB" while the size is not known. */
export function bytesText(received: number, total: number | null | undefined): string {
  if (!total) return formatBytes(received);
  const a = formatBytes(received);
  const b = formatBytes(total);
  const unit = (text: string) => text.split(" ")[1];
  return unit(a) === unit(b) ? `${a.split(" ")[0]} of ${b}` : `${a} of ${b}`;
}

/** Where one on its way stands, in Map data's words: "Waiting", "Downloading 1.20 of 4.90 GB, 18 minutes left", "Building". */
export function progressText(progress: RoadNetworkBuilding): string {
  switch (progress.phase) {
    case "waiting":
      return "Waiting";
    case "failed":
      return `Failed: ${progress.error ?? progress.message ?? "it stopped"}. Add it again to try once more`;
    case "building":
      return progress.message ? `Building: ${progress.message.replace(/\.$/, "")}` : "Building";
    default: {
      if (progress.receivedBytes === null || progress.receivedBytes === undefined) return "Downloading";
      const left =
        progress.etaSeconds !== null && progress.etaSeconds !== undefined && progress.etaSeconds >= 0
          ? `, ${formatDuration(progress.etaSeconds)} left`
          : "";
      return `Downloading ${bytesText(progress.receivedBytes, progress.totalBytes)}${left}`;
    }
  }
}

const fraction = (progress: RoadNetworkBuilding) =>
  progress.phase === "downloading" && progress.totalBytes && progress.receivedBytes !== null && progress.receivedBytes !== undefined
    ? progress.receivedBytes / progress.totalBytes
    : null;

export interface RouteNeeds {
  /** No roads kept, or kept for only part of it while the route goes further. */
  missing: RoadCoverageCountry[];
  coming: RoadCoverageCountry[];
  ready: RoadCoverageCountry[];
  /** Why Plan route waits, in a few words ("Add France first"), or null when it can go. */
  blocked: string | null;
}

export function routeNeeds(coverage: RoadCoverageResponse | undefined): RouteNeeds {
  const countries = coverage?.countries ?? [];
  const missing = countries.filter((c) => c.state === "missing" || c.state === "part");
  const coming = countries.filter((c) => c.state === "downloading");
  const ready = countries.filter((c) => c.state === "ready");
  const blocked =
    missing.length > 0
      ? `Add ${namesText(missing.map((c) => c.name))} first`
      : coming.length > 0
        ? `Wait for ${namesText(coming.map((c) => c.name))}`
        : null;
  return { missing, coming, ready, blocked };
}

/** The title of the box: "France has no roads yet", "France and Switzerland have no roads yet", "Only part of France has roads". */
export function missingTitle(missing: readonly Pick<RoadCoverageCountry, "name" | "state">[]): string {
  const none = missing.filter((c) => c.state !== "part");
  if (none.length > 0) return `${namesText(none.map((c) => c.name))} ${none.length === 1 ? "has" : "have"} no roads yet`;
  const part = missing.map((c) => c.name);
  return `Only part of ${namesText(part)} ${part.length === 1 ? "has" : "have"} roads`;
}

/** The countries a failed plan said it needs, from the error's details. */
export function problemOf(error: unknown): RoadRouteProblem | null {
  if (!(error instanceof ApiError) || !error.details) return null;
  const details = error.details as Partial<RoadRouteProblem>;
  if (!Array.isArray(details.missing) || !Array.isArray(details.far)) return null;
  return { missing: details.missing, far: details.far, ...(details.reason ? { reason: details.reason } : {}) };
}

/** The countries a failed plan's details name: those with none, then those with too little. */
export function problemCountries(problem: RoadRouteProblem): RoadMissingCountry[] {
  const out: RoadMissingCountry[] = [...problem.missing];
  for (const far of problem.far) if (far.country && !out.some((c) => c.code === far.country!.code)) out.push(far.country);
  return out;
}

/** The button that opens Map data's add flow for exactly these countries. */
export function AddRoadsButton({
  countries,
  onAdd,
  size,
  all = false,
}: {
  countries: ReadonlyArray<{ code: string; name: string }>;
  onAdd: (codes: string[]) => void;
  size?: "sm";
  /** "Add roads for all of France", where part is kept. */
  all?: boolean;
}) {
  const names = namesText(countries.map((c) => c.name));
  return (
    <Button variant="primary" size={size} onClick={() => onAdd(countries.map((c) => c.code))}>
      <Plus /> Add roads for {all ? "all of " : ""}
      {names}
    </Button>
  );
}

/** One country on its way: its name, where it stands, and a bar from real numbers. */
export function CountryProgress({ country }: { country: Pick<RoadCoverageCountry, "name" | "progress"> }) {
  if (!country.progress) return null;
  const value = fraction(country.progress);
  return (
    <div className="grid gap-1.5">
      <p className="tabular text-small text-ink">
        <span className="font-medium">{country.name}:</span> {progressText(country.progress)}.
      </p>
      <Progress
        value={value}
        tone={country.progress.phase === "waiting" ? "muted" : "lamp"}
        label={`${country.name}: roads for routes on their way`}
      />
    </div>
  );
}

/**
 * The box above Plan route. Nothing until the countries are known; then the gaps, those on
 * their way, and a line when one becomes ready while this is open.
 */
export function RouteNeedsNotice({ coverage, onAdd }: { coverage: RoadCoverageResponse | undefined; onAdd: (codes: string[]) => void }) {
  const needs = routeNeeds(coverage);
  // "France is ready." once its roads arrive while the person waits here.
  const was = useRef<Set<string>>(new Set());
  const [arrived, setArrived] = useState<string[]>([]);
  const comingKey = needs.coming.map((c) => c.code).join(",");
  const readyKey = needs.ready.map((c) => c.code).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: worked out from the keys, which change with the countries
  useEffect(() => {
    const now = new Set(needs.ready.map((c) => c.code));
    const came = [...was.current].filter((code) => now.has(code));
    if (came.length > 0) setArrived(needs.ready.filter((c) => came.includes(c.code)).map((c) => c.name));
    was.current = new Set(needs.coming.map((c) => c.code));
  }, [comingKey, readyKey]);

  const ready = needs.ready.map((c) => c.name);
  const gone = needs.missing.filter((c) => c.progress?.phase === "failed");
  const part = needs.missing.filter((c) => c.state === "part");
  return (
    <div className="grid gap-3" aria-live="polite">
      {needs.missing.length > 0 ? (
        <Notice tone="warning" icon={<CircleAlert />} title={missingTitle(needs.missing)}>
          <p>
            This route runs through {namesText(needs.missing.map((c) => c.name))}.
            {ready.length > 0 ? ` ${namesText(ready)} ${ready.length === 1 ? "is" : "are"} ready.` : ""}
          </p>
          {part.map((c) => (
            <p key={c.code} className="mt-1">
              For {c.name}, only {namesText(c.parts)} {c.parts.length === 1 ? "is" : "are"} kept, and the route goes further.
            </p>
          ))}
          {gone.map((c) => (
            <p key={c.code} className="mt-1">
              {c.name}: {progressText(c.progress!)}.
            </p>
          ))}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <AddRoadsButton countries={needs.missing} onAdd={onAdd} size="sm" all={part.length === needs.missing.length} />
            <span className="text-small text-ink-muted">Asks the size first. Needs a connection once.</span>
          </div>
        </Notice>
      ) : null}
      {needs.coming.length > 0 ? (
        <div className="grid gap-3 rounded-panel border border-border px-4 py-3" role="status">
          {needs.coming.map((c) => (
            <CountryProgress key={c.code} country={c} />
          ))}
          <p className="text-small text-ink-muted">You can leave this screen.</p>
        </div>
      ) : null}
      {arrived.length > 0 && needs.coming.length === 0 && needs.missing.length === 0 ? (
        <Notice tone="success" icon={<CircleCheck />}>
          {namesText(arrived)} {arrived.length === 1 ? "is" : "are"} ready.
        </Notice>
      ) : null}
    </div>
  );
}
