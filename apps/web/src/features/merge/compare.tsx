/**
 * Two versions of one thing, as text, side by side: home's and the drive's. On a
 * phone there is no room for two columns of prose, so one is shown at a time and a
 * switch above says which.
 *
 * Lines that the other version does not have sit on a tinted ground. The tint is never
 * the only sign: each side says in words how many of its lines differ, and a screen
 * reader hears "only here" before each such line.
 */
import type { MergeItem, MergeSide } from "@outpost/shared";
import { useMemo, useState } from "react";
import { ErrorState } from "@/components/page";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { cn, formatDate, plural } from "@/lib/utils";
import { useCompare } from "./merge-data";
import { type DiffLine, diffLines } from "./merge-model";

function Side({
  label,
  side,
  lines,
  marked,
  className,
}: {
  label: string;
  side: MergeSide;
  lines: DiffLine[];
  marked: boolean;
  className?: string;
}) {
  const differing = lines.filter((line) => line.differs).length;
  return (
    <section aria-label={label} className={cn("min-w-0", className)}>
      <header className="border-b border-border pb-2">
        <p className="text-small text-ink-muted">
          <span className="font-semibold text-ink">{label}</span>
          {side.updatedAt ? `, last changed ${formatDate(side.updatedAt)}` : ""}
        </p>
        <h4 className="mt-1 font-title text-lead break-words text-ink">{side.title}</h4>
        {side.fields.length > 0 ? (
          <dl className="mt-1.5 grid gap-0.5 text-small">
            {side.fields.map((field) => (
              <div key={field.label} className="flex gap-2">
                <dt className="shrink-0 text-ink-muted">{field.label}</dt>
                <dd className="min-w-0 break-words text-ink">{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      {side.text.trim() ? (
        <div className="scroll-quiet mt-2 max-h-[26rem] overflow-y-auto text-small leading-relaxed text-ink">
          {lines.map((line, index) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity but their place
              key={index}
              className={cn(
                line.text ? "break-words whitespace-pre-wrap px-1.5 py-px" : "h-2",
                line.differs && "rounded-[3px] bg-primary-soft text-primary-soft-ink",
              )}
            >
              {line.differs ? <span className="sr-only">Only here: </span> : null}
              {line.text}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-small text-ink-muted">No text.</p>
      )}
      <p className="mt-2 text-small text-ink-muted">
        {!marked
          ? "Too long to mark the differences line by line."
          : differing === 0
            ? "No line here is missing from the other version."
            : `${plural(differing, "line")} on a tinted ground ${differing === 1 ? "is" : "are"} only in this version.`}
        {side.truncatedAt ? " The text is cut short here; the whole of it is kept." : ""}
      </p>
    </section>
  );
}

export function Compare({ mergeId, item }: { mergeId: string; item: MergeItem }) {
  const compared = useCompare(mergeId, item.key, true);
  const [showing, setShowing] = useState<"home" | "drive">("drive");
  const data = compared.data;
  const diff = useMemo(() => diffLines(data?.home?.text ?? "", data?.drive?.text ?? ""), [data]);

  if (compared.isPending) {
    return (
      <div className="grid gap-2 py-1" aria-busy>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton />
        <Skeleton className="w-5/6" />
      </div>
    );
  }
  if (compared.isError) return <ErrorState error={compared.error} onRetry={() => compared.refetch()} />;

  const { home, drive } = data!;
  if (!home && !drive) return <p className="text-small text-ink-muted">Neither version could be shown.</p>;
  if (!home || !drive) {
    const only = (home ?? drive)!;
    const lines = only.text.split("\n").map((text) => ({ text, differs: false }));
    return <Side label={home ? "At home" : "On the drive"} side={only} lines={lines} marked />;
  }
  return (
    <div>
      <Segmented
        label="Which version to show"
        value={showing}
        onChange={setShowing}
        options={[
          { value: "home", label: "At home" },
          { value: "drive", label: "On the drive" },
        ]}
        className="mb-3 md:hidden"
      />
      <div className="grid gap-x-8 md:grid-cols-2">
        <Side label="At home" side={home} lines={diff.left} marked={diff.marked} className={cn(showing !== "home" && "max-md:hidden")} />
        <Side
          label="On the drive"
          side={drive}
          lines={diff.right}
          marked={diff.marked}
          className={cn(showing !== "drive" && "max-md:hidden")}
        />
      </div>
    </div>
  );
}
