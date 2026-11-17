/**
 * The answer of a calculator, and what goes with it: the answer in figures and in words,
 * Copy and Save as a page to keep it, and "How this is worked out" with the formula, its
 * source, the range it holds for and what it leaves out.
 */
import type { NoteDoc, NoteResponse } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Copy, ExternalLink, FilePlus2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { cn, formatDate } from "@/lib/utils";

export interface ResultProps {
  /** What the answer is of: "Water to store". */
  label: string;
  /** The answer, or null while an input is not usable (each input then says what is wrong with it). */
  figure: ReactNode | null;
  /** The same answer in a sentence. */
  children?: ReactNode;
  /** The answer as plain text, for Copy and Save as a page. Leave out to offer neither. */
  keep?: { title: string; lines: string[] };
  /** Said instead of the answer when it cannot be worked out for another reason than a bad input. */
  refusal?: ReactNode;
  className?: string;
}

export function Result({ label, figure, children, keep, refusal, className }: ResultProps) {
  return (
    <div className={cn("mt-5 rounded-panel bg-surface px-4 py-3", className)}>
      <div aria-live="polite" aria-atomic="true">
        <p className="text-small text-ink-muted">{label}</p>
        {refusal ? (
          <p className="mt-1 text-body text-ink">{refusal}</p>
        ) : figure === null ? (
          <p className="mt-1 text-body text-ink-muted">Correct the figure marked above to see the answer.</p>
        ) : (
          <>
            <p className="mt-0.5 text-heading font-semibold text-ink tabular">{figure}</p>
            {children ? <div className="mt-1 text-body text-ink">{children}</div> : null}
          </>
        )}
      </div>
      {keep && figure !== null && !refusal ? <KeepButtons title={keep.title} lines={keep.lines} /> : null}
    </div>
  );
}

/** A note of one paragraph per line, the last saying where it came from. */
export function noteDoc(lines: string[], from: string): NoteDoc {
  return {
    type: "doc",
    content: [...lines, from].map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  };
}

export function KeepButtons({ title, lines }: { title: string; lines: string[] }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const text = [title, ...lines].join("\n");
  const copy = async () => {
    if (await copyText(text)) toast.success("Copied");
    else notify.error("This browser would not copy it. Select the answer and copy it by hand.");
  };
  const save = async () => {
    setSaving(true);
    try {
      const from = `Worked out with Outpost's Tools on ${formatDate(Date.now())}. A calculator's answer is only as good as the figures typed into it.`;
      const { note } = await api.post<NoteResponse>("/api/notes", { title, content: noteDoc(lines, from) });
      void client.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Saved as a new page in Notes", {
        description: title,
        action: { label: "Open it", onClick: () => navigate(`/notes/${note.id}`) },
      });
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-2 -ml-2.5 flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" onClick={copy}>
        <Copy aria-hidden /> Copy
      </Button>
      <Button variant="ghost" size="sm" onClick={save} loading={saving}>
        <FilePlus2 aria-hidden /> Save as a page
      </Button>
    </div>
  );
}

export interface Source {
  /** As it is cited: "US National Weather Service, Wind chill calculator". */
  name: string;
  url?: string;
  /** When the page was read for this, as an ISO date. */
  read?: string;
}

/** "How this is worked out": one disclosure, closed until pressed. */
export function HowWorkedOut({
  formula,
  sources,
  range,
  limits,
  children,
}: {
  formula: ReactNode;
  sources: Source[];
  /** What the formula holds for. */
  range?: ReactNode;
  /** What it leaves out. */
  limits?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <details className="group mt-3">
      <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
        How this is worked out
      </summary>
      <div className="grid gap-3 pb-2 pl-6 text-small text-ink">
        <div>{formula}</div>
        {range ? (
          <p>
            <span className="font-semibold">Holds for: </span>
            {range}
          </p>
        ) : null}
        {limits ? (
          <p>
            <span className="font-semibold">Leaves out: </span>
            {limits}
          </p>
        ) : null}
        {children}
        <SourceList sources={sources} />
      </div>
    </details>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div>
      <p className="font-semibold">{sources.length === 1 ? "Source" : "Sources"}</p>
      <ul className="mt-1 grid gap-1 text-ink-muted">
        {sources.map((source) => (
          <li key={source.name}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                {source.name}
                <ExternalLink aria-hidden className="ml-1 inline size-3.5 align-[-0.125em]" />
              </a>
            ) : (
              source.name
            )}
            {source.read ? <span>, read {formatDate(Date.parse(`${source.read}T12:00:00Z`))}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A formula set out on its own line, in the face used for figures. */
export function Formula({ children }: { children: ReactNode }) {
  return <p className="my-1 font-mono text-small text-ink break-words">{children}</p>;
}
