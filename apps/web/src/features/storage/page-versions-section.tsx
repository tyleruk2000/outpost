/** The earlier versions of pages on the Storage screen: how much room they take, and clearing them. */
import { formatBytes, type NoteVersionsSpace } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { plural } from "@/lib/utils";

/** Under "notes", so that saving a page (`notes.changed`) brings the figure up to date. */
export const versionsSpaceKey = ["notes", "versions-space"] as const;

export function PageVersionsSection() {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const space = useQuery({ queryKey: versionsSpaceKey, queryFn: () => api.get<NoteVersionsSpace>("/api/notes/versions/space") });
  const clear = useMutation({
    mutationFn: () => api.delete<{ cleared: number }>("/api/notes/versions"),
    onSuccess: (result) => {
      setConfirming(false);
      toast.success(`Cleared ${plural(result.cleared, "earlier version")}.`);
      return client.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <Section title="Earlier versions of pages" description="Kept in the database as pages in Notes are saved, and thinned with age.">
      {space.isPending ? (
        <Skeleton className="h-5 w-2/3 max-w-md" />
      ) : space.isError ? (
        <ErrorState error={space.error} onRetry={() => space.refetch()} />
      ) : space.data.versions === 0 ? (
        <p className="max-w-[70ch] text-small text-ink-muted">None kept at the moment.</p>
      ) : (
        <div className="flex max-w-[70ch] flex-wrap items-center gap-x-4 gap-y-2">
          <p className="tabular text-small text-ink">
            {plural(space.data.versions, "version")} of {plural(space.data.pages, "page")}, {formatBytes(space.data.bytes)}.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
            Clear earlier versions
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Clear every earlier version?"
        description={
          space.data
            ? `${plural(space.data.versions, "earlier version")} of ${plural(space.data.pages, "page")} will be erased. The pages themselves stay as they are now. Reclaiming unused space in the database afterwards gives the room back to the disk.`
            : ""
        }
        confirmLabel="Clear earlier versions"
        onConfirm={() => clear.mutate()}
        loading={clear.isPending}
      />
    </Section>
  );
}
