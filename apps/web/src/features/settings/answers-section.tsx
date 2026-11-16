/**
 * Answers from your library, and chat, as simply as they can honestly be.
 *
 * The first thing shown is whether it is working, or the one next step if it is not.
 * Setting up is the three steps in features/setup/model-setup.tsx, and when the last of
 * them passes the server switches answers on by itself. The address, the numbers and
 * the rest are in answers-options.tsx, behind "More options".
 */
import type { AnswersStatus, ChatModelsResponse, ModelSetupLook, ModelSetupTry, Settings } from "@outpost/shared";
import { recommendModel, sameModelName } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton, Switch } from "@/components/ui/misc";
import { chatKeys } from "@/features/chat/chat-data";
import { ModelSetup } from "@/features/setup/model-setup";
import { api, errorMessage } from "@/lib/api";
import { AnswersOptions } from "./answers-options";
import { GuideLink, MoreOptions, SettingsSection } from "./parts";

/** Where the model runs, for the end of a sentence: "on this computer", "on your network, at 192.168.1.20:11434". */
export function whereWords(status: Pick<AnswersStatus, "place" | "server">): string {
  if (status.place === "this-computer") return "on this computer";
  if (status.place === "local-network") return `on your network, at ${status.server}`;
  return `at ${status.server}, which is not on your own network`;
}

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

export function AnswersSection({
  settings,
  disabled,
  save,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const enabled = settings["answers.enabled"];
  const endpoint = settings["answers.endpoint"];
  const model = settings["answers.model"];
  /** What the model said when it was tried a moment ago, to show once beside "Ready". */
  const [tried, setTried] = useState<ModelSetupTry | null>(null);

  const status = useQuery({
    queryKey: ["answers", "status", enabled, endpoint, model],
    queryFn: () => api.get<AnswersStatus>("/api/answers/status"),
    // A change made under More options asks again; what is on screen stays until the new answer is in, so that More options stays open.
    placeholderData: (previous) => previous,
  });
  // "Ready" should mean the model server is there. While answers are on, opening this section asks it for its
  // list of models, which is the cheapest way to know; while they are off, nothing is asked.
  const models = useQuery({
    queryKey: [...chatKeys.models, endpoint],
    queryFn: () => api.get<ChatModelsResponse>("/api/chat/models"),
    enabled,
    staleTime: 60_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const data = status.data;
  const list = models.data;
  const listed = list && !list.message ? list.models : null;
  // While a change is being read back from the server, what is on screen is the state before it: say nothing new yet.
  const settling = status.isPlaceholderData || (enabled && models.isPlaceholderData);
  const setUp = model !== "";
  const on = enabled && setUp && !settling && Boolean(data?.ready);
  const refused = Boolean(
    enabled && !settling && data && !data.ready && data.reason && (data.place === "elsewhere" || data.server === null),
  );
  const held = Boolean(listed?.some((entry) => sameModelName(entry.id, model)));
  const working = on && held;
  const silent = on && Boolean(list?.message);
  const gone = on && listed !== null && !held;
  const checking = enabled && setUp && (settling || (Boolean(data?.ready) && !list && models.isFetching));
  // The model server in Settings, as the first step would have found it, for choosing again from its list.
  const known: ModelSetupLook | undefined =
    (gone || (enabled && !setUp && !settling)) && listed && data?.server
      ? { found: true, address: endpoint, models: listed, message: "", recommended: recommendModel(listed) }
      : undefined;

  return (
    <SettingsSection
      id="answers"
      title="Answers from your library"
      description="A program on your own computer writes a short answer to a question from your library, and says which passage each part came from. A small model gets some answers wrong, so the passages are always shown beside the answer. Chat uses it too. Optional."
    >
      {status.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="w-64" />
          <Skeleton className="w-40" />
        </div>
      ) : status.isError || !data ? (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="The state of answers could not be read">
          {errorMessage(status.error)}
        </Notice>
      ) : (
        <>
          {setUp ? (
            <div className="flex items-start justify-between gap-x-6 gap-y-2">
              <div className="min-w-0 flex-1 text-small" aria-live="polite" data-testid="answers-state">
                {!enabled ? (
                  <>
                    <p className="font-medium text-ink">Off</p>
                    <p className="mt-0.5 text-ink-muted">
                      Turning it on uses <ModelName>{model}</ModelName>
                      {data.server ? ` ${whereWords(data)}` : ""}.
                    </p>
                  </>
                ) : working ? (
                  <>
                    <p className="flex items-start gap-1.5 font-medium text-ink">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      <span>
                        Ready: answers are written by <ModelName>{model}</ModelName> {whereWords(data)}.
                      </span>
                    </p>
                    {tried?.ok ? <p className="mt-0.5 text-ink-muted">{triedWords(tried)}</p> : null}
                  </>
                ) : checking ? (
                  <p className="font-medium text-ink">On. Asking the model server whether it is there…</p>
                ) : (
                  <p className="font-medium text-ink">On, but not working yet</p>
                )}
              </div>
              <Switch
                id="answers-switch"
                checked={enabled}
                disabled={disabled}
                onCheckedChange={(value) => {
                  setTried(null);
                  save("answers.enabled", value);
                }}
                aria-label="Write answers"
              />
            </div>
          ) : null}

          {working ? (
            <p className="text-small text-ink-muted">
              To use it, press <span className="font-medium text-ink">Answer from my library</span> on the{" "}
              <Link to="/search" className={link}>
                Search
              </Link>{" "}
              screen, or open{" "}
              <Link to="/chat" className={link}>
                Chat
              </Link>
              . What you ask is sent to that program and nowhere else. A small model is a helper, not an expert: when the passages found do
              not hold the answer, it should say so.
            </p>
          ) : null}

          {refused ? (
            <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="The address in More options cannot be used">
              {data.reason}
            </Notice>
          ) : silent ? (
            <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="The model server is not answering">
              <p>{list?.message}</p>
              <p className="mt-1.5">
                Start Ollama on that computer, then press Look again. <GuideLink part="when-it-does-not-work">What else to check</GuideLink>
              </p>
              <div className="mt-3">
                <Button size="sm" loading={models.isFetching} onClick={() => void models.refetch()}>
                  Look again
                </Button>
              </div>
            </Notice>
          ) : gone && known ? (
            <>
              <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="This model is not on the model server">
                The model server {whereWords(data)} is running, but it no longer has <ModelName>{model}</ModelName>. Choose one it has.
              </Notice>
              <ModelSetup key={`${endpoint}|${listed?.length}`} start={known} onReady={setTried} />
            </>
          ) : null}

          {!setUp ? (
            <>
              <p className="text-small text-ink-muted">
                Outpost does not come with this program. You install one, called Ollama, once: about 2 GB to download, which needs the
                internet. After that, what you ask stays on this computer or your own network.
              </p>
              <ModelSetup key={known ? "known" : "new"} start={known} onReady={setTried} />
            </>
          ) : (
            <p className="text-small text-ink-muted">
              <GuideLink part="answers-and-chat" />
            </p>
          )}

          <MoreOptions>
            <AnswersOptions
              settings={settings}
              disabled={disabled}
              save={save}
              status={data}
              models={enabled ? list : undefined}
              asking={models.isFetching}
              askAgain={() => void models.refetch()}
            />
          </MoreOptions>
        </>
      )}
    </SettingsSection>
  );
}

const ModelName = ({ children }: { children: string }) => (
  <span className="font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">{children}</span>
);

/** "It answered “ready” in 2.3 seconds." */
function triedWords(result: ModelSetupTry): string {
  const took = result.tookMs < 950 ? "under a second" : `${(result.tookMs / 1000).toFixed(1)} seconds`;
  return result.reply ? `Just now it answered “${result.reply}” in ${took}.` : `Just now it answered in ${took}.`;
}
