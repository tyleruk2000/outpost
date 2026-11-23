/** Pieces the preview and the report both show: what does not come across, long lists behind a summary, file names. */
import type { ImportConstructCount } from "@outpost/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Rows, Section } from "@/components/page";
import { describeConstruct, fileLabel } from "./preview-model";

/** A long list behind a line that says how long it is. */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group border-y border-border">
      <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

export function PathText({ path }: { path: string }) {
  return (
    <span className="font-mono text-[0.8125rem] break-all text-ink-muted" title={path}>
      {fileLabel(path)}
    </span>
  );
}

export function Losses({
  title = "What will not come across exactly",
  unsupported,
  converted = [],
}: {
  title?: string;
  unsupported: ImportConstructCount[];
  converted?: ImportConstructCount[];
}) {
  if (unsupported.length === 0 && converted.length === 0) return null;
  return (
    <Section
      title={title}
      description={
        unsupported.length > 0
          ? "Only what Outpost could recognise for certain is listed. The words of your pages are always kept."
          : undefined
      }
    >
      {unsupported.length > 0 ? (
        <Rows>
          {unsupported.map((entry) => {
            const words = describeConstruct(entry);
            return (
              <li key={entry.kind} className="py-3">
                <p className="tabular text-small font-medium text-ink">{words.name}</p>
                <p className="text-small text-ink-muted">{words.outcome}</p>
                <p className="mt-0.5 text-small text-ink-muted">
                  For example in <PathText path={entry.example} />
                </p>
              </li>
            );
          })}
        </Rows>
      ) : (
        <p className="text-small text-ink-muted">Nothing that Outpost could recognise will be lost.</p>
      )}
      {converted.length > 0 ? (
        <p className="mt-3 text-small text-ink-muted">
          Recognised and kept as they are: {converted.map((entry) => describeConstruct(entry).name).join(", ")}.
        </p>
      ) : null}
    </Section>
  );
}
