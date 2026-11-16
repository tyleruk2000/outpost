/**
 * Everything about answers and chat that is not the three steps: the model server's
 * address, the model by name, the test, the numbers, and the list of small models
 * Outpost suggests. It sits behind "More options" in the section, and can do everything
 * the section could do before it was made simple.
 */
import type { AnswersStatus, AnswerTestResult, ChatModelsResponse, Settings } from "@outpost/shared";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { RecommendedModels } from "@/features/setup/recommended-models";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { NumberSetting, SettingRow, TextSetting } from "./parts";

export const PLACE: Record<NonNullable<AnswersStatus["place"]>, string> = {
  "this-computer": "this computer",
  "local-network": "a machine on your network",
  elsewhere: "an address that is not on this computer or your home network",
};

export function AnswersOptions({
  settings,
  disabled,
  save,
  status,
  models,
  asking,
  askAgain,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  status: AnswersStatus | undefined;
  /** The model server's own list, as the section read it. Undefined while answers are off or it is being asked. */
  models: ChatModelsResponse | undefined;
  asking: boolean;
  askAgain: () => void;
}) {
  const enabled = settings["answers.enabled"];
  const endpoint = settings["answers.endpoint"];
  const model = settings["answers.model"];
  const budget = settings["answers.contextChars"];

  const test = useMutation({ mutationFn: () => api.post<AnswerTestResult>("/api/answers/test") });
  // A result describes the address and model it was run against, and nothing else.
  const resetTest = test.reset;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the result is cleared whenever what it tested changes
  useEffect(() => resetTest(), [endpoint, model, enabled, resetTest]);

  const reported = (models?.models ?? []).map((entry) => entry.id);
  const place = status?.place ?? null;
  const server = status?.server ?? null;
  const result = test.data;

  return (
    <>
      <SettingRow
        htmlFor="answers-endpoint"
        label="Server address"
        hint="Ollama is usually at http://127.0.0.1:11434/v1, LM Studio at http://127.0.0.1:1234/v1. llama.cpp’s server prints its address when it starts. “Look for Ollama on this computer” asks this address first."
        control={
          <TextSetting
            id="answers-endpoint"
            value={endpoint}
            disabled={disabled}
            onSave={(value) => save("answers.endpoint", value)}
            mono
          />
        }
      />
      {server && place === "elsewhere" && status?.reason && !status.ready ? (
        // Refused: the server says why, and names the start-up option that allows it.
        <Notice tone="warning" icon={<CircleAlert aria-hidden />}>
          {status.reason}
        </Notice>
      ) : server && place ? (
        <Notice tone={place === "elsewhere" ? "warning" : "info"} icon={place === "elsewhere" ? <CircleAlert aria-hidden /> : undefined}>
          When you ask for an answer, your question and the passages found for it are sent to{" "}
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{server}</span>, {PLACE[place]}. They are sent nowhere else,
          and nothing is sent until you ask.
          {place === "elsewhere" ? " Use this only if that machine is yours." : ""}
        </Notice>
      ) : null}

      <SettingRow
        htmlFor="answers-model"
        label="Model"
        hint={
          !enabled
            ? "The model’s name as the server knows it. The steps above choose one from the server’s own list."
            : asking && !models
              ? "Asking the server which models it has."
              : reported.length > 0
                ? `The server has ${reported.length === 1 ? "one model" : `${formatNumber(reported.length)} models`}. Choose one that writes text, not one that makes embeddings.`
                : `${models?.message ?? "The server’s list of models could not be read."} You can still type the model’s name as the server knows it.`
        }
        control={
          <span className="flex max-w-full items-center gap-1">
            {reported.length > 0 ? (
              <Select
                id="answers-model"
                value={model || undefined}
                onChange={(value) => save("answers.model", value)}
                disabled={disabled}
                placeholder="Choose a model"
                className="w-64 max-w-full font-mono"
                options={[
                  ...(model && !reported.includes(model) ? [{ value: model, label: model, description: "Not in the server’s list" }] : []),
                  ...reported.map((name) => ({ value: name, label: name })),
                ]}
              />
            ) : (
              <TextSetting
                id="answers-model"
                value={model}
                disabled={disabled}
                onSave={(value) => save("answers.model", value)}
                placeholder="For example llama3.2:3b"
                mono
              />
            )}
            {enabled ? (
              <Button variant="ghost" size="icon" aria-label="Ask the server for its models again" loading={asking} onClick={askAgain}>
                {asking ? null : <RefreshCw />}
              </Button>
            ) : null}
          </span>
        }
      />

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={() => test.mutate()} loading={test.isPending} disabled={disabled || !enabled}>
            Test
          </Button>
          <p className="min-w-48 flex-1 text-small text-ink-muted">
            {enabled
              ? "Asks the model for one word, to check the address, the model’s name and that it can write. A model that has to be loaded first can take a while."
              : "The test runs once answers are switched on. The steps above try a model without that."}
          </p>
        </div>
        {test.isError ? (
          <Notice tone="danger" className="mt-3">
            {errorMessage(test.error)}
          </Notice>
        ) : result ? (
          <Notice
            tone={result.ok ? "success" : "warning"}
            icon={result.ok ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
            title={result.ok ? "The model is answering" : "Not working yet"}
            className="mt-3"
          >
            {result.message}
            {result.ok ? (result.tookMs < 950 ? " It took under a second." : ` It took ${(result.tookMs / 1000).toFixed(1)} seconds.`) : ""}
          </Notice>
        ) : null}
      </div>

      <SettingRow
        htmlFor="answers-temperature"
        label="Temperature"
        hint="How freely the model varies its wording. Low keeps an answer close to its sources: 0.2 suits most models, and 0 is the most literal."
        control={
          <NumberSetting
            id="answers-temperature"
            value={settings["answers.temperature"]}
            min={0}
            max={2}
            decimals
            disabled={disabled}
            onSave={(value) => save("answers.temperature", value)}
          />
        }
      />
      <SettingRow
        htmlFor="answers-context"
        label="Context budget"
        hint={
          <>
            The most quoted text sent with a question: now about {formatNumber(Math.ceil(budget / 4))} tokens. More lets the model see more
            passages but takes longer, and it must fit the model’s context window with room left for the rules and the answer. Ollama reads
            4,096 tokens at once unless you tell it otherwise.{" "}
            <Link to="/search/how-it-works#stage-context" className="text-primary underline underline-offset-2">
              How the context is built
            </Link>
          </>
        }
        control={
          <NumberSetting
            id="answers-context"
            value={budget}
            min={1000}
            max={60000}
            disabled={disabled}
            onSave={(value) => save("answers.contextChars", value)}
            unit="characters"
          />
        }
      />

      <div>
        <p className="text-small font-medium text-ink">Models Outpost suggests</p>
        <RecommendedModels
          held={models && !models.message ? reported : null}
          command={Boolean(models && !models.message)}
          className="mt-1"
        />
      </div>

      <p className="text-small text-ink-muted">
        Questions and answers are not kept, on the server or in this browser. Answers draw on documents, notes and book chapters; reference
        collections such as Wikipedia are not read.{" "}
        <Link to="/search/how-it-works#stage-model" className="text-primary underline underline-offset-2">
          See the exact prompt that is sent
        </Link>
      </p>
    </>
  );
}
