/**
 * Everything about search by meaning that is not its one switch: where the model runs,
 * the build with its pause and stop, what it costs, how the two searches are weighed,
 * moving vectors between installations, and vectors left by other models. It sits
 * behind "More options" in the section, and can do everything the section could do
 * before it was made simple.
 */
import { formatBytes, formatDuration, type SemanticStatus, type Settings, vectorBytes } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Download, Pause, Square, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Segmented } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatNumber, plural } from "@/lib/utils";
import { NumberSetting, SettingRow, TextSetting } from "./parts";

/**
 * Seconds the built-in model takes for every thousand passages on a recent laptop,
 * quoted before anything is built. Measured on an Apple M2 Max with four threads: 33
 * for the bundled books, whose passages are mostly shorter than the longest allowed,
 * and 54 for a library made only of full-length ones. Once a build is running, the time
 * left comes from its own speed. See "What it costs" in docs/search.md.
 */
export const LAPTOP_SECONDS_PER_THOUSAND = 45;

/** What an index of this many passages costs, in plain words, before it is built. */
export function indexCost(passages: number, dimensions: number): { disk: string; time: string } {
  return {
    disk: formatBytes(passages * vectorBytes(dimensions)),
    time: formatDuration(Math.max(1, (passages / 1000) * LAPTOP_SECONDS_PER_THOUSAND)),
  };
}

/** The states the index can be in, as the screen names them. */
export type Stage = "empty" | "building" | "waiting" | "paused" | "failed" | "partial" | "complete";

export function indexStage(status: Pick<SemanticStatus, "indexing" | "build" | "embeddedChunks" | "totalChunks">): Stage {
  const { build } = status;
  if (status.indexing) return build?.state === "queued" && build.error ? "waiting" : "building";
  if (build?.state === "paused") return "paused";
  if (build?.state === "failed") return "failed";
  if (status.totalChunks > 0 && status.embeddedChunks >= status.totalChunks) return "complete";
  return status.embeddedChunks === 0 ? "empty" : "partial";
}

const stageTitle: Record<Stage, string> = {
  empty: "Index not built yet",
  building: "Building the index",
  waiting: "Waiting to try again",
  paused: "Building is paused",
  failed: "The build stopped",
  partial: "Index is partly built",
  complete: "Index is up to date",
};

type Save = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export function SemanticOptions({
  settings,
  disabled,
  save,
  data,
}: {
  settings: Settings;
  disabled: boolean;
  save: Save;
  /** The section's own reading of the server, so that the two levels never disagree. */
  data: SemanticStatus;
}) {
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const enabled = settings["search.semantic.enabled"];
  const provider = settings["search.semantic.provider"];
  const refresh = () => client.invalidateQueries({ queryKey: ["semantic"] });
  const failed = (error: unknown) => notify.error(errorMessage(error));

  const build = useMutation({ mutationFn: () => api.post<SemanticStatus>("/api/semantic/index"), onSuccess: refresh, onError: failed });
  const recheck = useMutation({
    mutationFn: () => api.get<SemanticStatus>("/api/semantic/status?fresh=1"),
    onSuccess: refresh,
    onError: failed,
  });
  const steer = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "cancel" }) => api.post(`/api/jobs/${id}/${action}`),
    onSettled: refresh,
    onError: failed,
  });
  const removeModel = useMutation({
    mutationFn: (modelId: string) => api.delete(`/api/semantic/models/${encodeURIComponent(modelId)}`),
    onSuccess: refresh,
    onError: failed,
  });
  const importVectors = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch("/api/semantic/import", {
        method: "POST",
        headers: { "X-Outpost-Request": "1", "Content-Type": "application/gzip" },
        body: file,
      });
      const body = await response.json();
      if (!response.ok)
        throw new ApiError(response.status, body.error?.code ?? "http", body.error?.message ?? "The file could not be loaded.");
      return body as { modelId: string; vectorsInFile: number; passagesUpdated: number; vectorsWithoutPassage: number };
    },
    onSuccess: (result) => {
      toast.success(
        `Loaded vectors for ${formatNumber(result.passagesUpdated)} passages. ${formatNumber(result.vectorsWithoutPassage)} in the file matched nothing in this library.`,
      );
      return refresh();
    },
    onError: failed,
  });

  const builtIn = data.builtIn;
  const usesBuiltIn = provider === "built-in";
  const stage = indexStage(data);
  const active = stage === "building" || stage === "waiting";
  const fraction = data.totalChunks > 0 ? data.embeddedChunks / data.totalChunks : 0;
  const remaining = Math.max(0, data.totalChunks - data.embeddedChunks);
  const cost = indexCost(remaining, data.dimensions ?? builtIn.dimensions);

  return (
    <>
      <SettingRow
        label="Where the model runs"
        hint={
          usesBuiltIn
            ? "A small model that comes with Outpost and runs on this device. Nothing to install, nothing to download."
            : provider === "demo"
              ? "Vectors made from word counts, to show the mechanics. Results follow shared words, not meaning; choose Built in for the real thing."
              : "A server on this device or network that speaks the OpenAI embeddings format, such as Ollama or llama.cpp. Use it for a larger model, or one trained on other languages."
        }
        control={
          <Segmented
            label="Where the model runs"
            value={provider}
            onChange={(value) => save("search.semantic.provider", value)}
            options={[
              { value: "built-in", label: "Built in" },
              { value: "openai-compatible", label: "Local server" },
              // Offered only to someone who already chose it; "How search works" uses it by itself.
              ...(provider === "demo" ? [{ value: "demo" as const, label: "Demonstration" }] : []),
            ]}
          />
        }
      />

      {usesBuiltIn ? (
        <p className="text-small text-ink-muted">
          The built-in model is <span className="font-medium text-ink">{builtIn.name}</span> ({formatBytes(builtIn.bytes)}), made by the
          Sentence Transformers project and used under the {builtIn.licence} licence. It was trained on {builtIn.languages} text and matches
          other languages poorly.
        </p>
      ) : null}

      {provider === "openai-compatible" ? (
        <>
          <SettingRow
            htmlFor="semantic-endpoint"
            label="Server address"
            hint="For Ollama this is usually http://127.0.0.1:11434/v1"
            control={
              <TextSetting
                id="semantic-endpoint"
                value={settings["search.semantic.endpoint"]}
                disabled={disabled}
                onSave={(value) => save("search.semantic.endpoint", value)}
                mono
              />
            }
          />
          <SettingRow
            htmlFor="semantic-model"
            label="Model"
            hint="The name the server knows it by, for example nomic-embed-text"
            control={
              <TextSetting
                id="semantic-model"
                value={settings["search.semantic.model"]}
                disabled={disabled}
                onSave={(value) => save("search.semantic.model", value)}
                mono
              />
            }
          />
        </>
      ) : null}

      {!enabled ? (
        <Cost passages={data.totalChunks} dimensions={builtIn.dimensions} />
      ) : provider === "none" ? (
        <Notice tone="info">Choose where the model runs to continue.</Notice>
      ) : !data.ready ? (
        <Notice
          tone="warning"
          icon={<CircleAlert />}
          title={
            usesBuiltIn
              ? builtIn.installed
                ? "The built-in model could not be started"
                : "The built-in model is not part of this installation"
              : "The model is not answering"
          }
          action={
            // Missing files do not come back by asking again; anything else might.
            usesBuiltIn && !builtIn.installed ? null : (
              <Button size="sm" loading={recheck.isPending} onClick={() => recheck.mutate()}>
                Check again
              </Button>
            )
          }
        >
          <p>{data.reason}</p>
          {usesBuiltIn ? <p className="mt-1.5">Ordinary search is not affected. A local server can be used instead.</p> : null}
        </Notice>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p className="flex items-center gap-1.5 text-small font-medium text-ink">
              {stage === "complete" ? <CircleCheck className="size-4 text-success" aria-hidden /> : null}
              {stageTitle[stage]}
            </p>
            <p className="tabular text-small text-ink-muted">
              {formatNumber(data.embeddedChunks)} of {plural(data.totalChunks, "passage")}
              {active && data.secondsLeft !== null
                ? data.secondsLeft < 10
                  ? ", a few seconds left"
                  : `, about ${formatDuration(data.secondsLeft)} left`
                : ""}
            </p>
          </div>
          <Progress
            value={fraction}
            tone={active ? "lamp" : stage === "complete" ? "success" : stage === "failed" ? "danger" : "primary"}
            label="Semantic index"
          />

          {stage === "failed" || stage === "waiting" ? (
            <p className="mt-2 text-small text-danger" role={stage === "failed" ? "alert" : undefined}>
              {data.build?.error ?? "The build stopped without saying why."}
              {stage === "waiting" ? " It will be tried again shortly." : " What was built before that is kept."}
            </p>
          ) : null}
          {stage === "empty" && data.totalChunks > 0 ? (
            <p className="mt-2 text-small text-ink-muted">
              Building reads {plural(remaining, "passage")} and adds about {cost.disk} to the database.
              {usesBuiltIn ? ` On a recent laptop that takes about ${cost.time}; a small computer takes several times longer.` : ""} It runs
              in the background and can be paused.
            </p>
          ) : null}
          {stage === "empty" && data.totalChunks === 0 ? (
            <p className="mt-2 text-small text-ink-muted">There is nothing to index yet. Add a document or write a page in Notes first.</p>
          ) : null}
          {stage === "paused" || stage === "partial" ? (
            <p className="mt-2 text-small text-ink-muted">
              {plural(remaining, "passage")} still to read. Searches already use the part that is built.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
            {active ? (
              <>
                <Button
                  disabled={disabled || !data.build}
                  loading={steer.isPending && steer.variables?.action === "pause"}
                  onClick={() => data.build && steer.mutate({ id: data.build.id, action: "pause" })}
                >
                  <Pause /> Pause
                </Button>
                <Button
                  variant="ghost"
                  disabled={disabled || !data.build}
                  loading={steer.isPending && steer.variables?.action === "cancel"}
                  onClick={() => data.build && steer.mutate({ id: data.build.id, action: "cancel" })}
                >
                  <Square /> Stop
                </Button>
              </>
            ) : stage === "complete" ? null : (
              <Button onClick={() => build.mutate()} loading={build.isPending} disabled={disabled || data.totalChunks === 0}>
                {stage === "empty" ? "Build index" : stage === "failed" ? "Try again" : "Continue building"}
              </Button>
            )}
          </div>
        </div>
      )}

      <SettingRow
        htmlFor="search-keyword-weight"
        label="Weight of matching words"
        hint="How much the search by words counts when the two searches are combined. Only matters while search by meaning is on. 0 leaves it out."
        control={
          <NumberSetting
            id="search-keyword-weight"
            value={settings["search.hybrid.keywordWeight"]}
            min={0}
            max={10}
            decimals
            disabled={disabled}
            onSave={(value) => save("search.hybrid.keywordWeight", value)}
          />
        }
      />
      <SettingRow
        htmlFor="search-semantic-weight"
        label="Weight of matching meaning"
        hint="How much the search by meaning counts. Raise it if results that share your words but miss your point rank too high."
        control={
          <NumberSetting
            id="search-semantic-weight"
            value={settings["search.hybrid.semanticWeight"]}
            min={0}
            max={10}
            decimals
            disabled={disabled}
            onSave={(value) => save("search.hybrid.semanticWeight", value)}
          />
        }
      />
      <SettingRow
        htmlFor="search-rrf-k"
        label="Evenness of combining"
        hint={
          <>
            The constant in the combining formula. A larger number makes first place count for less against tenth; 60 is the usual value.{" "}
            <Link to="/search/how-it-works#fig-formula" className="text-primary underline underline-offset-2">
              Try the three settings on a question of your own
            </Link>{" "}
            before changing them.
          </>
        }
        control={
          <NumberSetting
            id="search-rrf-k"
            value={settings["search.hybrid.rrfK"]}
            min={1}
            max={1000}
            disabled={disabled}
            onSave={(value) => save("search.hybrid.rrfK", value)}
          />
        }
      />

      {enabled && data.ready ? (
        <div className="border-t border-border pt-4">
          <p className="text-small font-medium text-ink">Building on another computer</p>
          <p className="mt-0.5 text-small text-ink-muted">
            Building is slow on small devices. A faster computer with the same library and model can build the vectors; save them there and
            load them here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" disabled={data.embeddedChunks === 0}>
              <a href="/api/semantic/export" download aria-disabled={data.embeddedChunks === 0}>
                <Download /> Save vectors to a file
              </a>
            </Button>
            <Button size="sm" disabled={disabled} loading={importVectors.isPending} onClick={() => fileRef.current?.click()}>
              <Upload /> Load vectors from a file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".gz,application/gzip"
              className="sr-only"
              tabIndex={-1}
              aria-label="Vectors file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importVectors.mutate(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      ) : null}

      {data.otherModels.length > 0 ? (
        <div>
          <p className="text-small font-medium text-ink">{enabled ? "Vectors from other models" : "Vectors that are kept"}</p>
          {enabled && usesBuiltIn && data.otherModels.some((model) => model.modelId.startsWith("built-in:")) ? (
            <p className="mt-0.5 text-small text-ink-muted">
              An earlier version of the built-in model made some of these. It read passages differently, so they are not used: build the
              index again, then remove them.
            </p>
          ) : null}
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {data.otherModels.map((model) => (
              <li key={model.modelId} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-small text-ink">{model.modelId}</span>
                  <span className="tabular block text-small text-ink-muted">
                    {plural(model.vectors, "passage")}, {formatBytes(model.vectors * vectorBytes(model.dimensions))}
                  </span>
                </span>
                <Button variant="danger-ghost" size="sm" disabled={disabled} onClick={() => removeModel.mutate(model.modelId)}>
                  <Trash2 /> Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** What switching on will cost, in the figures it was measured in. */
function Cost({ passages, dimensions }: { passages: number; dimensions: number }) {
  const cost = indexCost(passages, dimensions);
  const perThousand = indexCost(1000, dimensions);
  return (
    <dl className="grid gap-x-6 gap-y-3 border-y border-border py-3 text-small sm:grid-cols-2">
      <div>
        <dt className="font-medium text-ink">Time to build the index</dt>
        <dd className="mt-0.5 text-ink-muted">
          About {perThousand.time} for every thousand passages on a recent laptop; several times longer on a small computer such as a
          Raspberry Pi.{passages > 0 ? ` This library has ${formatNumber(passages)}: about ${cost.time} on that laptop.` : ""}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-ink">Disk for the index</dt>
        <dd className="mt-0.5 text-ink-muted">
          About {perThousand.disk} for every thousand passages, inside the database.
          {passages > 0 ? ` For this library, about ${cost.disk}.` : ""}
        </dd>
      </div>
    </dl>
  );
}
