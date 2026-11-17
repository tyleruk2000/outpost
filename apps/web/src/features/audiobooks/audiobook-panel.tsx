/** An audiobook's own page (Library → the book): the player, under the page's title. */
import { ErrorState } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { useAudiobook } from "./audiobook-data";
import { AudiobookPlayer } from "./audiobook-player";

export default function AudiobookPanel({ collectionId }: { collectionId: string }) {
  const book = useAudiobook(collectionId);
  if (book.isPending) {
    return (
      <div className="mt-5 grid gap-3" aria-busy>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (book.isError) {
    return (
      <div className="mt-5">
        <ErrorState error={book.error} onRetry={() => book.refetch()} />
      </div>
    );
  }
  return (
    <div className="mt-3">
      <AudiobookPlayer key={book.data.id} book={book.data} showTitle={false} showByline={false} />
    </div>
  );
}
