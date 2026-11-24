/**
 * "How search by meaning works": a plain explanation, with diagrams, of what Outpost does
 * when search by meaning is on, written for someone who has never heard of an
 * embedding. Every figure about this Outpost (on or off, how far it has read, which
 * model, the numbers that combine the two lists) comes from the server; the drawings
 * are illustrations and say so.
 *
 * What it describes is in modules/semantic (the model, the index build and the
 * automatic reading of new passages a few seconds after they are indexed) and in
 * modules/search (reciprocal rank fusion of the two lists).
 */
import { formatBytes, formatDuration, type SemanticStatus } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ErrorState, JumpLinks, Page, PageHeader } from "@/components/page";
import { Progress, Skeleton } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { indexCost } from "@/features/settings/semantic-options";
import { api } from "@/lib/api";
import { usePageVisible } from "@/lib/page-visible";
import { useSettings } from "@/lib/queries";
import { formatNumber, plural } from "@/lib/utils";
import { MapPlate, MergePlate, ModelPlate, WherePlate, WhyPlate } from "./plates";

export const SETTING = "/settings#semantic";
const EXPLAINER_PASSAGES = "/search/how-it-works#stage-cutting";
const EXPLAINER_DEEPER = "/search/how-it-works#stage-meaning";

const SECTIONS = [
  { id: "why", label: "Why" },
  { id: "passages", label: "Passages" },
  { id: "numbers", label: "Numbers for meaning" },
  { id: "nearest", label: "Nearest passages" },
  { id: "together", label: "With keyword search" },
  { id: "where", label: "Where it runs" },
  { id: "reading", label: "Reading your library" },
  { id: "limits", label: "Limits" },
];

const linkClass = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-24 border-t border-border pt-8 first:mt-0">
      <h2 id={`${id}-title`} className="mb-4 font-title text-heading text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function useStatus() {
  const shown = usePageVisible();
  return useQuery({
    queryKey: ["semantic", "status", "explained"],
    queryFn: () => api.get<SemanticStatus>("/api/semantic/status"),
    // While it is reading, the figures keep up; at rest, live events refresh them.
    refetchInterval: (query) => (shown && query.state.data?.indexing ? 5_000 : false),
  });
}

/** The model in use, in a few words: the one that comes with Outpost, or the one chosen instead. */
function modelName(status: SemanticStatus | undefined): string {
  if (!status || status.provider === "built-in") return status?.builtIn.name ?? "all-MiniLM-L6-v2";
  return status.model || status.provider;
}

/** This Outpost's own figures, read from the server. */
function OnThisOutpost({ status }: { status: ReturnType<typeof useStatus> }) {
  const data = status.data;
  return (
    <section aria-labelledby="here-title" className="mb-10 rounded-panel border border-border bg-surface px-4 py-4 sm:px-5">
      <h2 id="here-title" className="text-body font-semibold text-ink">
        On this Outpost now
      </h2>
      {status.isPending ? (
        <div className="mt-3 grid gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : status.isError || !data ? (
        <div className="mt-3">
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        </div>
      ) : (
        <HereFigures data={data} />
      )}
    </section>
  );
}

function HereFigures({ data }: { data: SemanticStatus }) {
  const read = data.enabled ? data.embeddedChunks : data.keptChunks;
  const total = data.totalChunks;
  const share = total > 0 ? Math.min(1, read / total) : 0;
  const state = !data.enabled
    ? "Off"
    : !data.ready
      ? "On, but not working yet"
      : data.indexing
        ? "On, reading your library"
        : total > 0 && read >= total
          ? "On and ready"
          : total === 0
            ? "On, with nothing to read yet"
            : "On, and not finished reading";
  return (
    <>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-small sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-ink-muted">Search by meaning</dt>
        <dd className="font-medium text-ink">{state}</dd>
        <dt className="text-ink-muted">Passages read</dt>
        <dd className="text-ink">
          <span className="tabular">
            {formatNumber(read)} of {plural(total, "passage")}
          </span>
          {data.indexing && data.secondsLeft !== null ? ` · about ${formatDuration(data.secondsLeft)} left` : null}
          {total > 0 ? (
            <Progress value={share} label="Passages read" tone={data.indexing ? "lamp" : "primary"} className="mt-1.5 max-w-xs" />
          ) : null}
        </dd>
        <dt className="text-ink-muted">Model</dt>
        <dd className="text-ink [overflow-wrap:anywhere]">
          {data.provider === "built-in"
            ? `${data.builtIn.name}, which comes with Outpost (${data.builtIn.languages}, ${data.builtIn.licence} licence)`
            : `${modelName(data)}, on an embedding server of your own`}
        </dd>
      </dl>
      {data.enabled && !data.ready && data.reason ? <p className="mt-2 text-small text-ink-muted">{data.reason}</p> : null}
      <p className="mt-3 text-small">
        <Link to={SETTING} className={linkClass}>
          {data.enabled ? "Search by meaning in Settings" : "Turn on search by meaning in Settings"}
        </Link>
      </p>
    </>
  );
}

/** Reciprocal rank fusion, as the server does it: each list adds weight ÷ (k + place). */
function fuse(
  lists: Array<{ weight: number; items: string[] }>,
  k: number,
): Array<{ name: string; score: number; places: Array<number | null> }> {
  const scored = new Map<string, { name: string; score: number; places: Array<number | null> }>();
  lists.forEach((list, which) => {
    list.items.forEach((name, index) => {
      const entry = scored.get(name) ?? { name, score: 0, places: lists.map(() => null) };
      entry.places[which] = index + 1;
      entry.score += list.weight / (k + index + 1);
      scored.set(name, entry);
    });
  });
  return [...scored.values()].sort((a, b) => b.score - a.score);
}

/** The example of the merging figure: four passages about a car that will not start. */
const BY_WORDS = ["Fuel", "Starter", "Cold"];
const BY_MEANING = ["Battery", "Fuel"];
const PASSAGE_NAMES: Record<string, string> = {
  Fuel: "“If the car won’t start, check the fuel”",
  Starter: "“A starter motor that clicks but won’t start”",
  Cold: "“Why cars won’t start on cold mornings”",
  Battery: "“A flat battery is the commonest reason…”",
};

function Together() {
  const settings = useSettings();
  const k = settings.data?.["search.hybrid.rrfK"] ?? 60;
  const wordsWeight = settings.data?.["search.hybrid.keywordWeight"] ?? 1;
  const meaningWeight = settings.data?.["search.hybrid.semanticWeight"] ?? 1;
  const fused = fuse(
    [
      { weight: wordsWeight, items: BY_WORDS },
      { weight: meaningWeight, items: BY_MEANING },
    ],
    k,
  );
  const share = (weight: number, place: number | null) =>
    place === null ? null : `${weight === 1 ? "1" : formatNumber(weight)} ÷ (${k} + ${place})`;
  return (
    <>
      <div className="prose">
        <p>Outpost runs both searches on every question, as long as search by meaning is on and has read something.</p>
        <p>Keyword search makes one list, best first. Search by meaning makes another.</p>
        <p>
          <strong>On the Search screen</strong>, each result keeps the score its words earned, and being near in meaning adds to it. A
          result found by meaning alone, with none of your words, is marked “Similar in meaning”. It always comes after every result that
          holds all your words, and it is left out when it is much further from your question than the nearest one. So when your words find
          plenty, these wait below; when your words find little or nothing, they fill the list.
        </p>
        <p>
          For a first aid question, a first aid or medical source that holds all your words, has one of them in its title or a heading, and
          whose passage means the same as your question, comes first. A forum post whose title happens to match does not come before the
          first aid manual. A whole nursing book that mentions the word on one page does not jump the queue either.
        </p>
        <p>
          Articles in reference collections have no numbers of their own, so meaning cannot lift them. They join the same list by their
          words alone, as they arrive.
        </p>
        <p>
          <strong>For an answer</strong>, Outpost picks passages rather than results, and combines the two lists by a method called{" "}
          <strong>reciprocal rank fusion</strong>.
        </p>
        <p>
          Each passage earns points from its place in each list: first place earns 1 ÷ ({k} + 1), second place 1 ÷ ({k} + 2), and so on.
        </p>
        <p>A passage on both lists earns points from both, so it rises to the top.</p>
        <p>Only places count, not the scores the two searches gave, because their scores are measured in different ways.</p>
      </div>

      <MergePlate words={BY_WORDS} meaning={BY_MEANING} together={fused.map((entry) => entry.name)} />

      <div className="my-5">
        <p aria-hidden className="mb-2 text-small text-ink-muted">
          How each passage in the example scores
        </p>
        <Table label="How each passage in the example scores" className="min-w-[20rem]">
          <TableHead>
            <Tr>
              <Th>Passage</Th>
              <Th numeric>By words</Th>
              <Th numeric>By meaning</Th>
              <Th numeric>Points</Th>
            </Tr>
          </TableHead>
          <tbody>
            {fused.map((entry) => (
              <Tr key={entry.name}>
                <Th scope="row" className="py-2.5 align-top text-ink">
                  {entry.name}
                  <span className="block font-normal text-ink-muted">{PASSAGE_NAMES[entry.name]}</span>
                </Th>
                <Td numeric>{share(wordsWeight, entry.places[0]!) ?? "not found"}</Td>
                <Td numeric>{share(meaningWeight, entry.places[1]!) ?? "not found"}</Td>
                <Td numeric>{entry.score.toFixed(4)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="prose">
        <p>
          <strong>A passage that holds all your words still ranks well.</strong> First place by words is worth exactly as much as first
          place by meaning, and a passage with your words is usually near in meaning too.
        </p>
        <p>
          {wordsWeight === meaningWeight
            ? "On this Outpost the two lists count equally."
            : `On this Outpost the list by words counts ${formatNumber(wordsWeight)} and the list by meaning ${formatNumber(meaningWeight)}.`}{" "}
          The number added to each place is {k}
          {k === 60 ? ", the usual value" : ""}. These can be changed under More options in{" "}
          <Link to={SETTING} className={linkClass}>
            Settings
          </Link>
          .
        </p>
        <p>
          When Outpost gathers passages for an answer, a passage found by meaning alone must also be close enough to the question. Its
          cosine similarity must be at least 0.3, and no more than 0.2 below the closest passage’s. That keeps out passages that are only
          loosely related.
        </p>
      </div>
    </>
  );
}

export default function HowMeaningWorksPage() {
  const status = useStatus();
  const data = status.data;
  const name = modelName(data);
  const builtIn = !data || data.provider === "built-in";
  const size = data ? formatBytes(data.builtIn.bytes) : "about 23 MB";
  const total = data?.totalChunks ?? 0;

  return (
    <Page width="reading">
      <PageHeader
        title="How search by meaning works"
        description="What Outpost does to find passages that mean what you asked, even when they use other words."
      />

      <OnThisOutpost status={status} />

      <JumpLinks label="On this page" items={SECTIONS} className="mt-0" />

      <Part id="why" title="Why search by meaning">
        <div className="prose">
          <p>Keyword search finds the words you typed.</p>
          <p>Search by meaning finds passages that say the same thing in other words.</p>
          <p>Search for “car won’t start” and it can also find a passage about a flat battery.</p>
          <p>Search for “tyre” and it can also find a manual that writes “tire”.</p>
        </div>
        <WhyPlate />
      </Part>

      <Part id="passages" title="First, documents are cut into passages">
        <div className="prose">
          <p>Outpost does not search whole documents. It cuts each one into short passages of a few paragraphs.</p>
          <p>Keyword search and search by meaning both work on these same passages.</p>
          <p>
            <Link to={EXPLAINER_PASSAGES} className={linkClass}>
              How documents are cut into passages
            </Link>{" "}
            is explained on How search works.
          </p>
        </div>
      </Part>

      <Part id="numbers" title="Each passage becomes a list of numbers">
        <div className="prose">
          <p>
            A small program called a <strong>model</strong> reads each passage.
          </p>
          <p>
            It gives back a list of 384 numbers that stands for what the passage means. This list is called an <strong>embedding</strong>.
          </p>
          <p>Passages with similar meanings get similar lists of numbers.</p>
          <p>The model learned this by reading a great deal of text before it came to Outpost. It does not learn from your library.</p>
          <p>Each passage is read together with its document’s title and its heading, because a short passage means little on its own.</p>
          <p>
            The model reads at most 256 word pieces at a time, roughly 200 words. A longer passage is read in parts, and the parts’ numbers
            are averaged.
          </p>
        </div>
        <ModelPlate modelName={builtIn ? name : "The model"} />
        <div className="prose">
          <p>Think of each list of numbers as a place on a map. Passages that mean similar things are close together.</p>
        </div>
        <MapPlate />
      </Part>

      <Part id="nearest" title="Your question finds its nearest passages">
        <div className="prose">
          <p>When you search, your question is turned into 384 numbers by the same model.</p>
          <p>Outpost then looks for the passages whose numbers are nearest to your question’s.</p>
          <p>
            Nearness is measured by <strong>cosine similarity</strong>: 1 means the same direction, 0 means unrelated.
          </p>
          <p>Outpost compares your question with every passage it has read, not a sample, so it never misses the closest one.</p>
          <p>
            To do that quickly, it keeps every passage’s numbers in memory rounded to whole numbers, which takes a quarter of the space.
            Then it works out the closest few exactly.
          </p>
        </div>
        <MapPlate withQuestion />
      </Part>

      <Part id="together" title="How it works together with keyword search">
        <Together />
      </Part>

      <Part id="where" title="Where it runs">
        <div className="prose">
          <p>Search by meaning runs entirely on this Outpost. It works with no internet connection.</p>
          {builtIn ? (
            <p>
              The model comes with Outpost. It is called {data?.builtIn.name ?? "all-MiniLM-L6-v2"}, it is {size}, and its licence is{" "}
              {data?.builtIn.licence ?? "Apache-2.0"}.
            </p>
          ) : (
            <p>
              This Outpost has been set to use {name}, on an embedding server of your own, instead of the model that comes with Outpost.
              Every passage is sent to that server, so it should be on this computer or your own network.
            </p>
          )}
          {builtIn ? <p>Nothing you search for and nothing in your library is sent anywhere.</p> : null}
          <p>
            {builtIn
              ? `${name} finds passages by meaning. It writes nothing:`
              : "A model of this kind finds passages by meaning and writes nothing:"}{" "}
            it turns text into numbers and cannot answer a question in words. <strong>Answer from my library</strong> needs a second,
            separate model that writes, a language model you run yourself. Outpost does not include one.
          </p>
          {builtIn && data ? (
            <p>It uses {plural(data.builtIn.threads, "processor thread")} on this computer, at most half of them.</p>
          ) : null}
        </div>
        <WherePlate modelLine={builtIn ? `The model, ${name}, ${size.replace(" ", "\u00a0")}` : `The model, ${name}`} />
      </Part>

      <Part id="reading" title="Reading your library">
        <div className="prose">
          <p>When you turn search by meaning on, Outpost reads every passage once to make its numbers.</p>
          <p>This happens in the background. You can keep using Outpost, and searches stay keyword searches until it has read something.</p>
          <p>
            On a recent laptop it takes about 45 seconds for every thousand passages.
            {total > 0 ? ` This library has ${plural(total, "passage")}: about ${indexCost(total, 384).time} on that laptop.` : ""}
          </p>
          <p>
            A Raspberry Pi 5 is about five times slower: about four minutes for every thousand passages (measured on 23 November 2026, 7,008
            passages in half an hour), so a large library takes some hours the first time.
          </p>
          <p>
            While it reads, Settings shows how far it has got and the time left at the speed it is really going.
            {data?.indexing && data.secondsLeft !== null ? ` Right now: about ${formatDuration(data.secondsLeft)} left.` : ""}
          </p>
        </div>
        <h3 className="mt-6 mb-2 text-lead font-semibold text-ink">After that, new documents are read by themselves</h3>
        <ol className="grid list-decimal gap-1.5 pl-6 text-body text-ink">
          <li>You add a document, or change a page.</li>
          <li>Outpost cuts it into passages for keyword search.</li>
          <li>About five seconds after that settles, it reads the new or changed passages for search by meaning.</li>
        </ol>
        <div className="prose mt-4">
          <p>This happens only while search by meaning is on.</p>
          <p>If you turn it off, what has been read is kept. When you turn it on again, Outpost reads only what is missing.</p>
          <p>
            To save time on a small computer, a faster computer can make the numbers for it. On a computer with a copy of Outpost’s source,
            one command fetches the passages from this Outpost, reads them, and sends the numbers back. Vectors can also be exported and
            imported under More options in{" "}
            <Link to={SETTING} className={linkClass}>
              Settings
            </Link>
            .
          </p>
        </div>
      </Part>

      <Part id="limits" title="What it cannot do">
        <ul className="grid list-disc gap-1.5 pl-6 text-body text-ink">
          {builtIn ? <li>The model that comes with Outpost was trained on English. It does poorly in other languages.</li> : null}
          <li>It is a small model. It can miss a passage that matters, or bring one that is only loosely related.</li>
          <li>It is weak on exact terms such as part numbers, surnames and unusual abbreviations. Keyword search covers for that.</li>
          <li>It does not understand like a person. It only measures how alike two texts are.</li>
          <li>It never replaces checking the source. Open the passage and read it.</li>
        </ul>
        <p className="mt-6 text-small text-ink-muted">
          For the arithmetic in more detail, with your own question, see{" "}
          <Link to={EXPLAINER_DEEPER} className={linkClass}>
            Search by meaning on How search works
          </Link>
          .
        </p>
      </Part>
    </Page>
  );
}
