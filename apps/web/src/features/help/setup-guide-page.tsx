/**
 * The set-up guide for search by meaning, answers and chat, as a page inside Outpost so
 * that it can be read with no internet. Settings and the Chat screen link to it; it is
 * not in the navigation.
 *
 * The words are not here. They are in packages/shared/src/setup-guide.ts, which
 * docs/setup-guide.md is also written from, so the two say the same thing in the same
 * order. This file only draws them: numbered steps, things to type set apart with a
 * button that copies them, and the steps for one kind of computer at a time.
 */
import {
  GUIDE_SYSTEMS,
  type GuideBlock,
  type GuideSection,
  type GuideSystem,
  guideInline,
  longDate,
  SETUP_GUIDE,
  type SystemInfo,
} from "@outpost/shared";
import { ArrowUpRight, Wifi } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Page, PageHeader } from "@/components/page";
import { Badge, Segmented } from "@/components/ui/misc";
import { SETTINGS_MODEL } from "@/features/chat/chat-data";
import { CommandLine, RecommendedModels } from "@/features/setup/recommended-models";
import { useSystem } from "@/lib/queries";

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/** Text with its three marks drawn: a thing to press, a thing to type, a link that leaves Outpost. */
export function GuideText({ text }: { text: string }) {
  return (
    <>
      {guideInline(text).map((part, index) => {
        // The pieces of one sentence never change order, so their position is their key.
        const key = `${index}:${part.text}`;
        if (part.type === "strong")
          return (
            <strong key={key} className="font-semibold">
              {part.text}
            </strong>
          );
        if (part.type === "code")
          return (
            <code
              key={key}
              className="rounded-[3px] bg-surface-strong px-1 py-0.5 font-mono text-[0.875em] text-ink [overflow-wrap:anywhere]"
            >
              {part.text}
            </code>
          );
        if (part.type === "link")
          return (
            <a key={key} href={part.url} target="_blank" rel="noreferrer" className={link}>
              {part.text}
              <ArrowUpRight aria-label="(opens in the browser, and needs the internet)" className="ml-0.5 inline size-3.5 align-[-0.1em]" />
            </a>
          );
        return part.text;
      })}
    </>
  );
}

/** The kind of computer Outpost's own server runs on: the likeliest place for Ollama to go. */
export function likelySystem(info: Pick<SystemInfo, "host"> | undefined): GuideSystem {
  if (info?.host.os === "windows") return "windows";
  if (info?.host.os === "linux") return "linux";
  return "mac";
}

type Choose = (system: GuideSystem) => void;

function Block({ block, system, choose }: { block: GuideBlock; system: GuideSystem; choose: Choose }): ReactNode {
  switch (block.kind) {
    case "text":
      return (
        <p>
          <GuideText text={block.text} />
        </p>
      );
    case "command":
      return <CommandLine command={block.command} />;
    case "steps":
      return (
        <ol className="grid list-decimal gap-3 pl-6 marker:font-medium marker:text-ink">
          {block.steps.map((step) =>
            typeof step === "string" ? (
              <li key={step} className="pl-1">
                <GuideText text={step} />
              </li>
            ) : (
              <li key={step.text} className="pl-1">
                <GuideText text={step.text} />
                <CommandLine command={step.command} className="mt-2" />
              </li>
            ),
          )}
        </ol>
      );
    case "bySystem":
      return (
        <div className="grid gap-4" data-system={system}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-small text-ink-muted">Steps for</span>
            <Segmented
              label="The computer Ollama runs on"
              value={system}
              onChange={choose}
              options={GUIDE_SYSTEMS.map(({ id, name }) => ({ value: id, label: name }))}
              className="max-w-full"
            />
          </div>
          {block.systems[system].map((inner, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the blocks of a guide are fixed text in a fixed order
            <Block key={index} block={inner} system={system} choose={choose} />
          ))}
        </div>
      );
    case "models":
      return <RecommendedModels held={null} command={false} />;
    case "problems":
      return (
        <ol className="grid list-decimal gap-5 pl-6 marker:font-medium marker:text-ink">
          {block.problems.map((problem) => (
            <li key={problem.says} className="pl-1">
              <p className="font-semibold">
                Outpost says: <GuideText text={problem.says} />
              </p>
              <p className="mt-1">
                <GuideText text={problem.means} />
              </p>
              <p className="mt-1">
                <span className="font-semibold">The fix:</span> <GuideText text={problem.fix} />
              </p>
            </li>
          ))}
        </ol>
      );
    case "sources":
      return (
        <ul className="divide-y divide-border border-y border-border text-small">
          {block.sources.map((source) => (
            <li key={source.url} className="py-2">
              <a href={source.url} target="_blank" rel="noreferrer" className={link}>
                {source.label}
              </a>
              <span className="block text-ink-muted">Gave: {source.gave}.</span>
            </li>
          ))}
        </ul>
      );
  }
}

/** A link from a part of the guide to the screen it is about. Not part of the guide's words. */
const OPENS: Record<string, { to: string; label: string }> = {
  "search-by-meaning": { to: "/settings#semantic-title", label: "Open Search by meaning in Settings" },
  "back-to-outpost": { to: SETTINGS_MODEL, label: "Open Answers from your library in Settings" },
};

function Section({ section, system, choose, level }: { section: GuideSection; system: GuideSystem; choose: Choose; level: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  const opens = OPENS[section.id];
  return (
    <section aria-labelledby={section.id} className={level === 2 ? "border-t border-border pt-8" : ""}>
      <Heading
        id={section.id}
        className={level === 2 ? "scroll-mt-20 font-title text-heading text-ink" : "scroll-mt-20 text-lead font-semibold text-ink"}
      >
        {section.title}
      </Heading>
      {section.needsInternet ? (
        <p className="mt-2">
          <Badge tone="neutral">
            <Wifi aria-hidden /> This step needs the internet
          </Badge>
        </p>
      ) : null}
      <div className="mt-3 grid gap-4">
        {section.blocks.map((block, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the blocks of a guide are fixed text in a fixed order
          <Block key={index} block={block} system={system} choose={choose} />
        ))}
        {opens ? (
          <p>
            <Link to={opens.to} className={link}>
              {opens.label}
            </Link>
          </p>
        ) : null}
      </div>
      {section.parts?.length ? (
        <div className="mt-8 grid gap-8">
          {section.parts.map((part) => (
            <Section key={part.id} section={part} system={system} choose={choose} level={3} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function SetupGuidePage() {
  const info = useSystem();
  const [chosen, setChosen] = useState<GuideSystem | null>(null);
  const system = chosen ?? likelySystem(info.data);

  // A link such as /help/search-and-answers#get-ollama lands on that part.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <Page width="reading">
      <PageHeader
        title={SETUP_GUIDE.title}
        description={SETUP_GUIDE.intro.map((paragraph) => (
          <span key={paragraph} className="mb-2 block last:mb-0">
            <GuideText text={paragraph} />
          </span>
        ))}
      />

      <nav aria-label="On this page" className="mb-8 text-small">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {SETUP_GUIDE.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-9 items-center text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-10 text-body text-ink">
        {SETUP_GUIDE.sections.map((section) => (
          <Section key={section.id} section={section} system={system} choose={setChosen} level={2} />
        ))}
      </div>

      <p className="mt-10 border-t border-border pt-4 text-small text-ink-muted">
        Checked on {longDate(SETUP_GUIDE.checked)}. The same guide is in Outpost’s documentation as{" "}
        <span className="font-mono">docs/setup-guide.md</span>.
      </p>
    </Page>
  );
}
