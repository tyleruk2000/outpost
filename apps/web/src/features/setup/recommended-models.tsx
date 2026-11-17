/**
 * The short list of small models Outpost suggests, wherever a person is choosing one
 * or has none yet. The list itself is packages/shared/src/recommended-models.ts; this
 * only draws it, marks the ones the model server already has, and shows the command
 * that fetches the one to start with. Outpost does not fetch models itself.
 */
import {
  longDate,
  MODEL_LIBRARY_URL,
  memoryWords,
  pullCommand,
  RECOMMENDED_MODELS,
  RECOMMENDED_MODELS_CHECKED,
  type RecommendedModel,
  STARTING_MODEL,
  sameModelName,
} from "@outpost/shared";
import { Check, CircleCheck, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** Something to type, set apart, with a button that copies it. */
export function CommandLine({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex items-start gap-1 rounded-control border border-border bg-surface py-1 pr-1 pl-3", className)}>
      {/* Shown whole, wrapped if it must be: it is often read off a phone and typed on another computer. */}
      <pre className="min-w-0 flex-1 py-1.5 font-mono text-[0.8125rem] leading-5 whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        <code>{command}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Copy: ${command.split("\n")[0]}`}
        onClick={async () => {
          setCopied(await copyText(command));
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        <span className="max-sm:sr-only">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}

/** What a recommended model costs: "2.0 GB to download. Takes about 2.3 GB of memory, so it wants a computer with 8 GB." */
export function modelCost(model: RecommendedModel, held = false): string {
  return `${model.download} ${held ? "on disk" : "to download"}. Takes ${memoryWords(model).replace(/ \((measured|estimated)\)$/, "")} of memory, so it ${
    model.fits === "4 GB" ? "fits a computer with 4 GB" : "wants a computer with 8 GB"
  }.`;
}

export function RecommendedModels({
  held,
  command = true,
  note = true,
  className,
}: {
  /** Names of the models the model server has. Null when no server has been asked. */
  held: string[] | null;
  /** Show the command that fetches the one to start with, when the server has none of these. */
  command?: boolean;
  /** Say where the list came from and when. The guide leaves it out: it says so itself. */
  note?: boolean;
  className?: string;
}) {
  const has = (model: RecommendedModel) => Boolean(held?.some((name) => sameModelName(name, model.name)));
  const none = !RECOMMENDED_MODELS.some(has);
  return (
    <div className={className}>
      <ul className="divide-y divide-border border-y border-border" aria-label="Recommended small models">
        {RECOMMENDED_MODELS.map((model) => (
          <li key={model.name} className="py-2.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[0.8125rem] font-medium text-ink">{model.name}</span>
              {model.start ? <Badge tone="primary">Start with this one</Badge> : null}
              {has(model) ? (
                <Badge tone="success">
                  <CircleCheck aria-hidden /> On your model server
                </Badge>
              ) : null}
            </p>
            <p className="tabular mt-0.5 text-small text-ink">{modelCost(model, has(model))}</p>
            <p className="text-small text-ink-muted">{model.suits}</p>
          </li>
        ))}
      </ul>
      {command && none ? (
        <div className="mt-3">
          <p className="text-small text-ink">
            To get the one to start with, type this on the computer Ollama runs on. It needs the internet, this once.
          </p>
          <CommandLine command={pullCommand(STARTING_MODEL.name)} className="mt-1.5" />
        </div>
      ) : null}
      {note ? (
        <p className="mt-2 text-small text-ink-muted">
          Small models for a laptop or a Raspberry Pi 5. Names and sizes are as{" "}
          <a
            href={MODEL_LIBRARY_URL}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-1 underline-offset-2 hover:decoration-2"
          >
            Ollama’s library
          </a>{" "}
          listed them on {longDate(RECOMMENDED_MODELS_CHECKED)}; memory is roughly what each takes once loaded. Outpost does not download
          models itself.
        </p>
      ) : null}
    </div>
  );
}
