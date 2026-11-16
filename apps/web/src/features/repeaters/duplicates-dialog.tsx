/**
 * Find duplicates: the entries held that are the same repeater, side by side, and the
 * means to make one of each group.
 *
 * Two kinds are kept apart. Entries with the same callsign on the same frequency are
 * the same repeater, and can be merged one group at a time or all at once. Entries on
 * one frequency at nearly one place under different callsigns may be the same, and are
 * merged only pair by pair, when the person says so of that pair.
 *
 * Merging deletes nothing: the entry that is kept takes on whatever the person typed
 * on the others, and the others are set aside, to come back if they are separated.
 */
import { formatMHz, type RepeaterDuplicateGroup } from "@outpost/shared";
import { CircleCheck, Merge } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { formatDistance } from "@/features/maps/lib/geo";
import { formatNumber, plural } from "@/lib/utils";
import { useMergeAllDuplicates, useMergeDuplicates, useRepeaterDuplicates } from "./data";
import { SideBySide } from "./side-by-side";

function Group({
  group,
  busy,
  onMerge,
}: {
  group: RepeaterDuplicateGroup;
  busy: boolean;
  onMerge: (keepId: string, mergeIds: string[]) => void;
}) {
  const [keepId, setKeepId] = useState(group.keepId);
  const first = group.entries[0]!;
  const what =
    group.strength === "same"
      ? `${first.callsign}, ${formatMHz(first.outputHz)} MHz`
      : `${group.entries.map((entry) => entry.callsign).join(" and ")}, ${formatMHz(first.outputHz)} MHz`;
  const others = group.entries.map((entry) => entry.id!).filter((id) => id !== keepId);
  return (
    <li className="grid gap-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-body text-ink">
          <span className="font-semibold">{what}</span>{" "}
          <span className="tabular text-small text-ink-muted">
            {plural(group.entries.length, "entry", "entries")}
            {group.spreadMeters !== null && group.spreadMeters >= 100 ? `, listed up to ${formatDistance(group.spreadMeters)} apart` : ""}
          </span>
        </p>
        <Button size="sm" onClick={() => onMerge(keepId, others)} loading={busy}>
          <Merge /> {group.entries.length === 2 ? "Merge these two" : `Merge these ${group.entries.length}`}
        </Button>
      </div>
      <SideBySide
        entries={group.entries}
        keepId={keepId}
        onKeep={setKeepId}
        name={`keep-${group.key}`}
        caption={`${what}: the entries side by side`}
      />
    </li>
  );
}

export function DuplicatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const found = useRepeaterDuplicates(open);
  const merge = useMergeDuplicates();
  const mergeAll = useMergeAllDuplicates();
  const [merging, setMerging] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const one = (group: RepeaterDuplicateGroup, keepId: string, mergeIds: string[]) => {
    setMerging(group.key);
    merge.mutate(
      { keepId, mergeIds },
      {
        onSuccess: (result) => {
          setDone((count) => count + result.setAside);
          toast.success(`Merged: ${plural(result.setAside, "entry", "entries")} set aside.`);
        },
        onSettled: () => setMerging(null),
      },
    );
  };
  const data = found.data;
  const nothing = data && data.sameTotal === 0 && data.possibleTotal === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || merge.isPending || mergeAll.isPending) return;
        setDone(0);
        onClose();
      }}
    >
      <DialogContent title="Find duplicates" size="xl">
        <DialogBody className="grid gap-5">
          {found.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-28 w-full" />
              <span className="sr-only">Looking for duplicates</span>
            </div>
          ) : found.isError ? (
            <ErrorState error={found.error} onRetry={() => void found.refetch()} />
          ) : nothing ? (
            <Notice tone="success" icon={<CircleCheck />} title={done > 0 ? "No duplicates are left" : "No duplicates"}>
              {done > 0
                ? `${plural(done, "entry", "entries")} set aside. Each repeater is listed once.`
                : "No two entries have the same callsign on the same frequency, and none share a frequency at nearly the same place."}
            </Notice>
          ) : data ? (
            <>
              <p className="max-w-[72ch] text-small text-ink-muted">
                Merging keeps one entry of each group and sets the others aside. Whatever you typed or changed on any of them is carried
                onto the one that is kept, and what the others had that it lacks fills the gaps. Nothing is deleted: the entries can be
                separated again on the repeater's own screen.
              </p>

              {data.sameTotal > 0 ? (
                <section className="grid gap-2" aria-label="The same repeater">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="tabular text-body font-semibold text-ink">{plural(data.sameTotal, "repeater")} held more than once</h3>
                      <p className="text-small text-ink-muted">The same callsign on the same frequency, to within 3 kHz.</p>
                    </div>
                    <Button
                      variant="primary"
                      loading={mergeAll.isPending}
                      disabled={merge.isPending}
                      onClick={() =>
                        mergeAll.mutate(undefined, {
                          onSuccess: (result) => {
                            setDone((count) => count + result.setAside);
                            toast.success(
                              `Merged ${plural(result.merged, "repeater")}: ${plural(result.setAside, "entry", "entries")} set aside.`,
                            );
                          },
                        })
                      }
                    >
                      <Merge /> Merge all {formatNumber(data.sameTotal)}
                    </Button>
                  </div>
                  <p className="text-small text-ink-muted">
                    “Merge all” keeps, in each, the entry of the list with the newest data. To keep another, choose it below and merge that
                    group by itself.
                    {data.sameTotal > data.same.length ? ` The first ${formatNumber(data.same.length)} are shown.` : ""}
                  </p>
                  <ul className="divide-y divide-border border-y border-border" aria-label="Repeaters held more than once">
                    {data.same.map((group) => (
                      <Group
                        key={group.key}
                        group={group}
                        busy={merging === group.key}
                        onMerge={(keepId, mergeIds) => one(group, keepId, mergeIds)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {data.possibleTotal > 0 ? (
                <section className="grid gap-2" aria-label="Possibly the same repeater">
                  <h3 className="tabular text-body font-semibold text-ink">
                    {plural(data.possibleTotal, "pair")} that may be the same repeater
                  </h3>
                  <p className="max-w-[72ch] text-small text-ink-muted">
                    Different callsigns on one frequency at nearly one place: often one repeater spelt two ways, sometimes a repeater and a
                    gateway that share a site. Outpost does not merge these by itself. Look at each pair, and merge it only if it is one.
                    {data.possibleTotal > data.possible.length ? ` The first ${formatNumber(data.possible.length)} are shown.` : ""}
                  </p>
                  <ul className="divide-y divide-border border-y border-border" aria-label="Pairs that may be the same repeater">
                    {data.possible.map((group) => (
                      <Group
                        key={group.key}
                        group={group}
                        busy={merging === group.key}
                        onMerge={(keepId, mergeIds) => one(group, keepId, mergeIds)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="primary"
            disabled={merge.isPending || mergeAll.isPending}
            onClick={() => {
              setDone(0);
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
