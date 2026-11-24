/**
 * Setting up answers and chat in three steps, each shown once the one before is done:
 * find the model server, choose one of its models, try it. When the try succeeds the
 * server saves the address and the model and switches answers on, so there is nothing
 * left to press. Settings and the Chat screen both show this, so there is one way to
 * set up wherever a person meets it.
 *
 * Nothing is asked of any model server until a button here is pressed.
 */
import {
  type ChatModel,
  formatBytes,
  looksLikeEmbeddingModel,
  type ModelSetupLook,
  type ModelSetupTry,
  pullCommand,
  RECOMMENDED_MODELS,
  recommendedEntry,
  STARTING_MODEL,
  sameModelName,
} from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Radar } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { chatApi, chatKeys } from "@/features/chat/chat-data";
import { GuideLink } from "@/features/settings/parts";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CommandLine, modelCost, RecommendedModels } from "./recommended-models";

/**
 * A model's size in words, for one that is not on Outpost's own list: how big the file
 * is, and roughly the memory it takes, which is its size and a little more.
 */
export function sizeWords(bytes: number | null): string {
  if (bytes === null) return "";
  const band = bytes < 1e9 ? "Very small" : bytes < 3e9 ? "Small" : bytes < 6e9 ? "Medium-sized" : "Large";
  const memory = Math.ceil((bytes / 1e9 + 0.3) * 2) / 2;
  const fits =
    memory <= 2
      ? "fits a computer with 4 GB"
      : memory <= 4.5
        ? "wants a computer with 8 GB"
        : `wants a computer with ${memory <= 9 ? 16 : 32} GB or more`;
  return `${band}: ${formatBytes(bytes)} on disk. Takes about ${memory} GB of memory, so it ${fits}.`;
}

/** The server's models in the order they are offered: Outpost's own suggestions first, then by size, then the ones that cannot write. */
export function inOfferOrder(models: ChatModel[]): ChatModel[] {
  const rank = (model: ChatModel) => {
    const listed = RECOMMENDED_MODELS.findIndex((entry) => sameModelName(entry.name, model.id));
    if (looksLikeEmbeddingModel(model)) return 3_000;
    return listed >= 0 ? listed : 1_000;
  };
  return [...models].sort(
    (a, b) =>
      rank(a) - rank(b) || (a.sizeBytes ?? Number.MAX_SAFE_INTEGER) - (b.sizeBytes ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
  );
}

const LOOPBACK = ["127.0.0.1", "localhost", "::1", "[::1]"];

/**
 * Where a model server for Outpost is looked for, as the person using this screen would say it: "this computer" when
 * the screen is open on the computer Outpost runs on, otherwise that computer by its address. On a phone, "this
 * computer" read as the phone.
 */
export function outpostComputer(): string {
  const host = typeof window === "undefined" ? "localhost" : window.location.hostname;
  return LOOPBACK.includes(host) ? "this computer" : `the computer Outpost runs on (${host})`;
}

const placeOf = (address: string | null): string => {
  try {
    const host = new URL(address ?? "").hostname;
    return [...LOOPBACK, "host.docker.internal"].includes(host) ? `on ${outpostComputer()}` : `at ${new URL(address ?? "").host}`;
  } catch {
    return "";
  }
};

function Step({ number, title, done, children }: { number: number; title: ReactNode; done?: boolean; children?: ReactNode }) {
  return (
    <li>
      <p className={cn("flex items-start gap-2 text-small", done ? "text-ink-muted" : "font-medium text-ink")}>
        {done ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label={`Step ${number} done`} />
        ) : (
          <span className="tabular w-4 shrink-0 text-center" aria-hidden>
            {number}.
          </span>
        )}
        <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
      </p>
      {children ? <div className="mt-2 pl-6">{children}</div> : null}
    </li>
  );
}

export function ModelSetup({
  start,
  onReady,
  className,
}: {
  /** A model server that is already known (the one in Settings), to begin at the second step. */
  start?: ModelSetupLook;
  /** Called when the model answered and answers were switched on. */
  onReady?: (result: ModelSetupTry) => void;
  className?: string;
}) {
  const client = useQueryClient();
  const [found, setFound] = useState<ModelSetupLook | null>(start ?? null);
  const [model, setModel] = useState<string | undefined>(start?.recommended ?? undefined);
  const [confirmed, setConfirmed] = useState(false);

  const look = useMutation({
    mutationFn: chatApi.setupLook,
    onSuccess: (result) => {
      setFound(result);
      setModel(result.recommended ?? undefined);
      setConfirmed(false);
      attempt.reset();
    },
  });
  const attempt = useMutation({
    mutationFn: () => chatApi.setupTry(found?.address ?? "", model ?? ""),
    onSuccess: (result) => {
      if (!result.saved) return;
      // The server has changed three settings; everything that shows them reads again.
      void client.invalidateQueries({ queryKey: ["settings"] });
      void client.invalidateQueries({ queryKey: ["answers"] });
      void client.invalidateQueries({ queryKey: chatKeys.all });
      onReady?.(result);
    },
  });

  const server = found?.found ? found : null;
  const models = server ? inOfferOrder(server.models) : [];
  const where = placeOf(server?.address ?? null);
  const noneSuggested = models.length > 0 && !models.some((entry) => recommendedEntry(entry.id));
  const result = attempt.data;

  return (
    <ol className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", className)} aria-label="Setting up answers and chat">
      {server ? (
        <Step number={1} done title={<>Found a model server {where}.</>} />
      ) : (
        <Step number={1} title="Find Ollama">
          <p className="text-small text-ink-muted">
            If Ollama is installed and running, Outpost can find it. <GuideLink part="answers-and-chat">I do not have Ollama yet</GuideLink>
          </p>
          <div className="mt-3">
            <Button variant="primary" loading={look.isPending} onClick={() => look.mutate()}>
              {look.isPending ? null : <Radar aria-hidden />} Look for Ollama on{" "}
              {LOOPBACK.includes(window.location.hostname) ? "this computer" : "the Outpost computer"}
            </Button>
          </div>
          {look.isError ? (
            <Notice tone="danger" className="mt-3">
              {errorMessage(look.error)}
            </Notice>
          ) : found && !found.found ? (
            <Notice tone="info" className="mt-3" title="Ollama was not found">
              <p>{found.message}</p>
              <p className="mt-1.5">
                If it is not installed yet, <GuideLink part="get-ollama">the guide has the steps</GuideLink>. The model to get first is{" "}
                <span className="font-mono text-[0.8125rem]">{STARTING_MODEL.name}</span> ({STARTING_MODEL.download}).
              </p>
              {LOOPBACK.includes(window.location.hostname) ? null : (
                <p className="mt-1.5">
                  It is installed on {outpostComputer()}, not on this device: whoever looks after this Outpost can do it there.
                </p>
              )}
            </Notice>
          ) : null}
        </Step>
      )}

      {server && confirmed && model ? (
        <Step
          number={2}
          done
          title={
            <>
              Using <span className="font-mono text-[0.8125rem] text-ink">{model}</span>.{" "}
              <Button variant="link" size="sm" onClick={() => setConfirmed(false)}>
                Choose another
              </Button>
            </>
          }
        />
      ) : server ? (
        <Step number={2} title="Choose a model">
          {models.length === 0 ? (
            <>
              <p className="text-small text-ink">
                Ollama is running, but it has no models yet. A model is the part that does the writing: one large file that Ollama
                downloads. <GuideLink part="get-a-model">Where to type the command</GuideLink>
              </p>
              <RecommendedModels held={[]} className="mt-3" />
              <div className="mt-3">
                <Button loading={look.isPending} onClick={() => look.mutate()}>
                  Look again
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-small text-ink-muted">
                A model is the part that does the writing. Smaller ones answer sooner; larger ones keep closer to what your library says.
              </p>
              <RadioGroup.Root
                value={model ?? ""}
                onValueChange={setModel}
                aria-label="Model to use"
                className="mt-2 divide-y divide-border border-y border-border"
              >
                {models.map((entry) => {
                  const listed = recommendedEntry(entry.id);
                  const cannot = looksLikeEmbeddingModel(entry);
                  return (
                    <RadioGroup.Item
                      key={entry.id}
                      value={entry.id}
                      className="group flex w-full items-start gap-3 py-2.5 text-left outline-offset-2 max-md:min-h-11"
                    >
                      <span className="mt-0.5 grid size-4 shrink-0 place-content-center rounded-full border-[1.5px] border-border-strong bg-page group-data-[state=checked]:border-primary">
                        <RadioGroup.Indicator className="block size-2 rounded-full bg-primary" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-[0.8125rem] font-medium text-ink [overflow-wrap:anywhere]">{entry.id}</span>
                          {listed ? <Badge tone="primary">{listed.start ? "Recommended to start with" : "Recommended"}</Badge> : null}
                        </span>
                        <span className="tabular mt-0.5 block text-small text-ink-muted">
                          {cannot
                            ? "This one is for searching, not writing. It cannot answer."
                            : listed
                              ? modelCost(listed, true)
                              : sizeWords(entry.sizeBytes)}
                        </span>
                        {listed && !cannot ? <span className="block text-small text-ink-muted">{listed.suits}</span> : null}
                      </span>
                    </RadioGroup.Item>
                  );
                })}
              </RadioGroup.Root>
              {noneSuggested ? (
                <div className="mt-3">
                  <p className="text-small text-ink">
                    None of these is on Outpost’s short list of small models. Any model that writes will do; to get the one Outpost suggests
                    starting with, type this on the computer Ollama runs on, then look again.
                  </p>
                  <CommandLine command={pullCommand(STARTING_MODEL.name)} className="mt-1.5" />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" disabled={!model} onClick={() => setConfirmed(true)}>
                  Use this model
                </Button>
                <Button variant="ghost" loading={look.isPending} onClick={() => look.mutate()}>
                  Look again
                </Button>
              </div>
            </>
          )}
        </Step>
      ) : null}

      {server && confirmed && model ? (
        <Step number={3} title="Try it">
          <p className="text-small text-ink-muted">
            Outpost asks the model for one word and shows what comes back. The first try can take a minute, because the model is loaded into
            memory then.
          </p>
          <div className="mt-3">
            <Button variant="primary" loading={attempt.isPending} onClick={() => attempt.mutate()}>
              {result && !result.ok ? "Try it again" : "Try it"}
            </Button>
          </div>
          {attempt.isError ? (
            <Notice tone="danger" className="mt-3">
              {errorMessage(attempt.error)}
            </Notice>
          ) : result && !result.ok ? (
            <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="Not working yet" className="mt-3">
              {result.message}
            </Notice>
          ) : result?.ok ? (
            <Notice tone="success" icon={<CircleCheck aria-hidden />} title="It answered" className="mt-3">
              {result.message} Answers and chat are switched on.
            </Notice>
          ) : null}
        </Step>
      ) : null}
    </ol>
  );
}
