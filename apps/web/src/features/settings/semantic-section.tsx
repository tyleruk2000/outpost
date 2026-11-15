import type { SemanticStatus, Settings } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Segmented, Switch } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { SettingRow, SettingsSection, TextSetting } from "./parts";

export function SemanticSection({ settings, disabled, save }: { settings: Settings; disabled: boolean; save: <K extends keyof Settings>(key: K, value: Settings[K]) => void }) {
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const enabled = settings["search.semantic.enabled"];
  const provider = settings["search.semantic.provider"];

  const status = useQuery({
    queryKey: ["semantic", "status", enabled, provider, settings["search.semantic.model"], settings["search.semantic.endpoint"]],
    queryFn: () => api.get<SemanticStatus>("/api/semantic/status"),
    refetchInterval: (query) => (query.state.data?.indexing ? 2000 : false),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["semantic"] });

  const build = useMutation({
    mutationFn: () => api.post<SemanticStatus>("/api/semantic/index"),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const removeModel = useMutation({
    mutationFn: (modelId: string) => api.delete(`/api/semantic/models/${encodeURIComponent(modelId)}`),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const importVectors = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch("/api/semantic/import", { method: "POST", headers: { "X-Outpost-Request": "1", "Content-Type": "application/gzip" }, body: file });
      const body = await response.json();
      if (!response.ok) throw new ApiError(response.status, body.error?.code ?? "http", body.error?.message ?? "The file could not be loaded.");
      return body as { modelId: string; vectorsInFile: number; passagesUpdated: number; vectorsWithoutPassage: number };
    },
    onSuccess: (result) => {
      toast.success(`Loaded vectors for ${formatNumber(result.passagesUpdated)} passages. ${formatNumber(result.vectorsWithoutPassage)} in the file matched nothing in this library.`);
      return refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const data = status.data;
  const fraction = data && data.totalChunks > 0 ? data.embeddedChunks / data.totalChunks : 0;
  const complete = data ? data.embeddedChunks >= data.totalChunks && data.totalChunks > 0 : false;

  return (
    <SettingsSection
      id="semantic"
      title="Search by meaning"
      description="Optional. Finds passages about the same thing even when they use different words. Ordinary search works without it."
    >
      <SettingRow
        label="Search by meaning"
        hint="Needs a model that turns text into numbers, running on this device or your network. Nothing is sent to the internet."
        control={<Switch checked={enabled} disabled={disabled} onCheckedChange={(value) => save("search.semantic.enabled", value)} aria-label="Search by meaning" />}
      />
      {enabled ? (
        <>
          <SettingRow
            label="Where the model runs"
            hint={
              provider === "transformers"
                ? "Inside Outpost, from files in the models folder of the data directory. Needs the optional @huggingface/transformers package."
                : provider === "demo"
                  ? "Built in, nothing to install. Vectors are made from word counts, so results follow shared words rather than meaning. Good for seeing how the pieces fit before setting up a real model."
                  : "A server on this device or network that speaks the OpenAI embeddings format, such as Ollama or llama.cpp."
            }
            control={
              <Segmented
                label="Where the model runs"
                value={provider === "none" ? "openai-compatible" : provider}
                onChange={(value) => save("search.semantic.provider", value)}
                options={[
                  { value: "openai-compatible", label: "Local server" },
                  { value: "transformers", label: "Inside Outpost" },
                  { value: "demo", label: "Demonstration" },
                ]}
              />
            }
          />
          {provider !== "transformers" && provider !== "demo" ? (
            <SettingRow
              htmlFor="semantic-endpoint"
              label="Server address"
              hint="For Ollama this is usually http://127.0.0.1:11434/v1"
              control={<TextSetting id="semantic-endpoint" value={settings["search.semantic.endpoint"]} disabled={disabled} onSave={(value) => save("search.semantic.endpoint", value)} mono />}
            />
          ) : null}
          {provider === "demo" ? null : (
          <SettingRow
            htmlFor="semantic-model"
            label="Model"
            hint={provider === "transformers" ? "Folder name under models/, for example Xenova/all-MiniLM-L6-v2" : "The name the server knows it by, for example nomic-embed-text"}
            control={<TextSetting id="semantic-model" value={settings["search.semantic.model"]} disabled={disabled} onSave={(value) => save("search.semantic.model", value)} mono />}
          />
          )}

          {status.isPending ? null : provider === "none" ? (
            <Notice tone="info">Choose where the model runs to continue.</Notice>
          ) : data && !data.ready ? (
            <Notice tone="warning" icon={<CircleAlert />} title="The model is not answering">
              {data.reason}
            </Notice>
          ) : data ? (
            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-small font-medium text-ink">
                  {data.indexing ? "Building the index" : complete ? "Index is up to date" : data.embeddedChunks === 0 ? "Index not built yet" : "Index is partly built"}
                </p>
                <p className="tabular text-small text-ink-muted">
                  {formatNumber(data.embeddedChunks)} of {formatNumber(data.totalChunks)} passages
                  {data.dimensions ? `, ${data.dimensions} numbers each` : ""}
                </p>
              </div>
              <Progress value={fraction} tone={data.indexing ? "lamp" : complete ? "success" : "primary"} label="Semantic index" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => build.mutate()} loading={build.isPending || data.indexing} disabled={disabled || complete}>
                  {data.indexing ? "Building" : data.embeddedChunks === 0 ? "Build index" : "Continue building"}
                </Button>
                <Button asChild variant="ghost" disabled={data.embeddedChunks === 0}>
                  <a href="/api/semantic/export" download aria-disabled={data.embeddedChunks === 0}>
                    <Download /> Save vectors to a file
                  </a>
                </Button>
                <Button variant="ghost" disabled={disabled} loading={importVectors.isPending} onClick={() => fileRef.current?.click()}>
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
              <p className="mt-2 text-small text-ink-muted">
                Building is slow on small devices. A faster computer with the same library and model can build the vectors; save them there and load them here.
              </p>
            </div>
          ) : null}

          {data && data.otherModels.length > 0 ? (
            <div>
              <p className="text-small font-medium text-ink">Vectors from other models</p>
              <ul className="mt-1 divide-y divide-border border-y border-border">
                {data.otherModels.map((model) => (
                  <li key={model.modelId} className="flex items-center justify-between gap-4 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-small text-ink">{model.modelId}</span>
                      <span className="tabular block text-small text-ink-muted">{formatNumber(model.vectors)} passages</span>
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
      ) : null}
    </SettingsSection>
  );
}
