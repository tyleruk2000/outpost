/**
 * An audio document's screen: the player, in place of a page viewer. A chapter of an
 * audiobook (opened from search, say) plays its book from that chapter.
 */
import type { DocumentDto } from "@outpost/shared";
import { ErrorState } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { useAudiobook } from "./audiobook-data";
import { AudiobookPlayer } from "./audiobook-player";

export default function AudioViewer({ document }: { document: DocumentDto }) {
  const book = useAudiobook(document.id);
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[46rem] px-5 py-6 md:px-10 md:py-10">
        {book.isPending ? (
          <div className="grid gap-3" aria-busy>
            <Skeleton className="h-7 w-72 max-w-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-4 h-40" />
          </div>
        ) : book.isError ? (
          <ErrorState error={book.error} onRetry={() => book.refetch()} />
        ) : (
          <AudiobookPlayer key={book.data.id} book={book.data} startAt={document.id} showTitle={book.data.kind === "book"} />
        )}
      </div>
    </div>
  );
}
