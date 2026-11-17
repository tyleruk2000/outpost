/**
 * Search by meaning, as one switch.
 *
 * Turning it on is all a person does: the server uses the model that comes with
 * Outpost and reads the library by itself (modules/semantic). This section says what
 * that will cost before, how far it has got during, and when it is ready. A set-up
 * that cannot work, such as one left pointing at a server that is not there, is said
 * plainly and put right with one press. Everything else is in semantic-options.tsx,
 * behind "More options".
 */
import { formatBytes, formatDuration, type SemanticStatus, type Settings, secondsLeft, vectorBytes } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Skeleton, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { cn, formatNumber, plural } from "@/lib/utils";
import { GuideLink, MoreOptions, SettingsSection } from "./parts";
import { indexCost, indexStage, LAPTOP_SECONDS_PER_THOUSAND, SemanticOptions } from "./semantic-options";

export { indexCost, indexStage, LAPTOP_SECONDS_PER_THOUSAND, secondsLeft };

/** Host and port of an address, for showing; the address as typed when it cannot be read. */
function hostOf(address: string): string {
  try {
    return new URL(address).host || address;
  } catch {
    return address;
  }
}

export function SemanticSection({
  settings,
  disabled,
  save,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const client = useQueryClient();
  const enabled = settings["search.semantic.enabled"];
  const provider = settings["search.semantic.provider"];
  // Between the switch being turned on and the server saying it has begun, the screen says "starting".
  const [turnedOnAt, setTurnedOnAt] = useState<number | null>(null);
  const turnedOnRef = useRef(false);
  turnedOnRef.current = turnedOnAt !== null;

  const shown = usePageVisible();
  const status = useQuery({
    queryKey: ["semantic", "status", enabled, provider, settings["search.semantic.model"], settings["search.semantic.endpoint"]],
    queryFn: () => api.get<SemanticStatus>("/api/semantic/status"),
    // A change made under More options asks again; what is on screen stays until the new answer is in, so that More options stays open.
    placeholderData: (previous) => previous,
    // While something is being read, or is about to be (new passages wait a few seconds), the screen keeps up with it.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!shown || !data?.enabled || !data.ready) return false;
      if (data.indexing) return 2000;
      const behind = data.embeddedChunks < data.totalChunks;
      return behind && (turnedOnRef.current || data.build?.state === "succeeded") ? 2000 : false;
    },
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["semantic"] });
  const failed = (error: unknown) => notify.error(errorMessage(error));
  // The repair changes two settings on the server; the screen reads them again, and the state with them.
  const settled = () => {
    setTurnedOnAt(Date.now());
    void client.invalidateQueries({ queryKey: ["settings"] });
    return refresh();
  };

  const read = useMutation({ mutationFn: () => api.post<SemanticStatus>("/api/semantic/index"), onSuccess: refresh, onError: failed });
  const useBuiltIn = useMutation({
    mutationFn: () => api.post<SemanticStatus>("/api/semantic/use-built-in"),
    onSuccess: settled,
    onError: failed,
  });

  // While a change is being read back from the server, what is held is the state before it.
  const settling = status.isPlaceholderData;
  const data = status.data;
  const stage = data ? indexStage(data) : "empty";
  const underWay = stage === "building" || stage === "waiting";
  const starting =
    enabled && turnedOnAt !== null && Boolean(data?.ready) && !underWay && stage !== "complete" && (data?.totalChunks ?? 0) > 0;
  useEffect(() => {
    if (turnedOnAt === null) return;
    // The server begins within a second or two. If it has not after ten, say what is so instead of "starting".
    const timer = window.setTimeout(() => setTurnedOnAt(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [turnedOnAt]);

  const builtIn = data?.builtIn;
  const ownServer = provider !== "built-in";
  // A set-up that names something other than what comes with Outpost, and is off or not answering.
  const offerBuiltIn = Boolean(data && !settling && builtIn?.installed && ownServer && (!enabled || !data.ready));

  return (
    <SettingsSection
      id="semantic"
      title="Search by meaning"
      description="Finds things that are about what you typed, even when they use different words. Optional: ordinary search works without it."
    >
      <div className="flex items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 text-small" aria-live="polite">
          {status.isPending ? (
            <Skeleton className="mt-1 w-56" />
          ) : status.isError || !data || !builtIn ? (
            <State word="Not known" tone="danger">
              The state of search by meaning could not be read. {errorMessage(status.error)}
            </State>
          ) : !enabled ? (
            <State word="Off">{settling ? null : <Off data={data} ownServer={ownServer} />}</State>
          ) : settling ? (
            <State word="Starting" />
          ) : !data.ready ? (
            <State word="On, but not working yet" />
          ) : starting ? (
            <State word="Starting">Outpost is about to read your library.</State>
          ) : stage === "complete" ? (
            <State word="Ready" tone="success">
              Search now also finds things by meaning. What you add is read as it arrives. Nothing leaves this computer.
            </State>
          ) : data.totalChunks === 0 ? (
            <State word="On">There is nothing to read yet. What you add is read as it arrives.</State>
          ) : underWay ? (
            <State word="Reading your library" />
          ) : (
            <State word="On, and not finished reading" />
          )}
        </div>
        <Switch
          id="semantic-switch"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(value) => {
            setTurnedOnAt(value ? Date.now() : null);
            save("search.semantic.enabled", value);
          }}
          aria-label="Search by meaning"
        />
      </div>

      {data && enabled && data.ready && !settling ? (
        <Reading data={data} stage={stage} starting={starting} busy={read.isPending} disabled={disabled} onRead={() => read.mutate()} />
      ) : null}

      {data && builtIn && offerBuiltIn ? (
        <Notice
          tone={enabled ? "warning" : "info"}
          icon={enabled ? <CircleAlert aria-hidden /> : undefined}
          title={
            !enabled
              ? "This was set up to use a separate program"
              : provider === "openai-compatible"
                ? "The program this was set up to use is not answering"
                : "Nothing has been chosen to do the reading"
          }
        >
          <p>
            {provider === "openai-compatible" ? (
              <>
                Search by meaning was pointed at a program of your own at{" "}
                <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{hostOf(settings["search.semantic.endpoint"])}</span>
                {enabled ? ", and nothing there is answering. " : ". If you do not run one, there is no need to: "}
              </>
            ) : provider === "demo" ? (
              "It is set to a demonstration that matches shared words, not meaning. "
            ) : null}
            Outpost comes with what it needs, with nothing to install.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" loading={useBuiltIn.isPending} disabled={disabled} onClick={() => useBuiltIn.mutate()}>
              Use what comes with Outpost
            </Button>
            {enabled && provider === "openai-compatible" ? (
              <Button size="sm" loading={read.isPending} disabled={disabled} onClick={() => read.mutate()}>
                Try my own again
              </Button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      {data && builtIn && enabled && !settling && !data.ready && !offerBuiltIn ? (
        <Notice
          tone="warning"
          icon={<CircleAlert aria-hidden />}
          title={
            !ownServer && !builtIn.installed
              ? "This installation is missing the part that does this"
              : !ownServer
                ? "The part of Outpost that does this could not be started"
                : "The program this was set up to use is not answering"
          }
        >
          <p>{data.reason}</p>
          <p className="mt-1.5">Ordinary search is not affected.</p>
          {/* Missing files do not come back by asking again; anything else might. */}
          {!ownServer && !builtIn.installed ? null : (
            <div className="mt-3">
              <Button size="sm" loading={read.isPending} disabled={disabled} onClick={() => read.mutate()}>
                Try again
              </Button>
            </div>
          )}
        </Notice>
      ) : null}

      <p className="text-small text-ink-muted">
        <GuideLink part="search-by-meaning" />
      </p>

      {data ? (
        <MoreOptions>
          <SemanticOptions settings={settings} disabled={disabled} save={save} data={data} />
        </MoreOptions>
      ) : null}
    </SettingsSection>
  );
}

/** What it is and what switching it on will cost, or what is being kept while it is off. */
function Off({ data, ownServer }: { data: SemanticStatus; ownServer: boolean }) {
  const kept = data.keptChunks;
  if (kept > 0) {
    const size = formatBytes(kept * vectorBytes(data.dimensions ?? data.builtIn.dimensions));
    const more = Math.max(0, data.totalChunks - kept);
    return (
      <>
        What Outpost read before is kept ({plural(kept, "passage")}, {size}), so turning it on again{" "}
        {more > 0 ? `only has ${plural(more, "new passage")} to read.` : "takes no time."}
      </>
    );
  }
  if (ownServer) return null;
  if (data.totalChunks === 0) {
    return <>Turn it on and Outpost reads what you add, as you add it, on this computer. Nothing leaves this computer.</>;
  }
  const cost = indexCost(data.totalChunks, data.builtIn.dimensions);
  return (
    <>
      Turn it on and Outpost reads your library once, on this computer: about {cost.time} for its {plural(data.totalChunks, "passage")} on a
      recent laptop, longer on a small computer, and about {cost.disk} of disk. Nothing leaves this computer.
    </>
  );
}

/** The state in a word or two, which is what a person looks for first, and a sentence about it. */
function State({ word, tone, children }: { word: string; tone?: "success" | "danger"; children?: ReactNode }) {
  return (
    <>
      <p className={cn("flex items-center gap-1.5 font-medium", tone === "danger" ? "text-danger" : "text-ink")}>
        {tone === "success" ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden /> : null}
        {word}
      </p>
      {children ? <p className="mt-0.5 text-ink-muted">{children}</p> : null}
    </>
  );
}

/** "about 5 minutes left"; "a few seconds left" once it is too close to count. */
export function timeLeft(seconds: number): string {
  return seconds < 10 ? "a few seconds left" : `about ${formatDuration(seconds)} left`;
}

/** How far the reading has got, in plain words, with the one next step when there is one. */
function Reading({
  data,
  stage,
  starting,
  busy,
  disabled,
  onRead,
}: {
  data: SemanticStatus;
  stage: ReturnType<typeof indexStage>;
  starting: boolean;
  busy: boolean;
  disabled: boolean;
  onRead: () => void;
}) {
  if (stage === "complete" || data.totalChunks === 0) return null;
  const active = stage === "building" || stage === "waiting" || starting;
  const remaining = Math.max(0, data.totalChunks - data.embeddedChunks);
  const fraction = data.totalChunks > 0 ? data.embeddedChunks / data.totalChunks : 0;
  // Until the build has gone long enough to judge its own speed, the estimate is the measured laptop figure, and says so.
  const left =
    data.secondsLeft !== null
      ? timeLeft(data.secondsLeft)
      : `about ${formatDuration(Math.max(10, (remaining / 1000) * LAPTOP_SECONDS_PER_THOUSAND))} on a recent laptop`;
  return (
    <div>
      <p className="tabular mb-2 text-small text-ink">
        {active ? (
          <>
            Reading {plural(data.totalChunks, "passage")}, {left}.
          </>
        ) : stage === "paused" ? (
          <>Paused. {plural(remaining, "passage")} still to read.</>
        ) : stage === "failed" ? (
          <>Reading stopped with {plural(remaining, "passage")} still to read.</>
        ) : (
          <>
            {formatNumber(data.embeddedChunks)} of {plural(data.totalChunks, "passage")} read.
          </>
        )}
      </p>
      <Progress
        value={starting && data.embeddedChunks === 0 ? null : fraction}
        tone={active ? "lamp" : stage === "failed" ? "danger" : "primary"}
        label="Reading your library"
      />
      {stage === "failed" || stage === "waiting" ? (
        <p className="mt-2 text-small text-danger" role={stage === "failed" ? "alert" : undefined}>
          {data.build?.error ?? "It stopped without saying why."}
          {stage === "waiting" ? " It will be tried again shortly." : " What was read before that is kept."}
        </p>
      ) : null}
      <p className="mt-2 text-small text-ink-muted">
        {active
          ? `${formatNumber(data.embeddedChunks)} read so far, and searches already use them. You can leave this page; it carries on. Turning the switch off pauses it and keeps what was read.`
          : data.embeddedChunks > 0
            ? "Searches already use what has been read."
            : "Searches go by words until some of it has been read."}
      </p>
      {active ? null : (
        <div className="mt-3">
          <Button variant="primary" loading={busy} disabled={disabled} onClick={onRead}>
            {stage === "failed"
              ? "Try again"
              : stage === "paused"
                ? "Carry on reading"
                : data.embeddedChunks > 0
                  ? "Read the rest"
                  : "Start reading"}
          </Button>
        </div>
      )}
    </div>
  );
}
