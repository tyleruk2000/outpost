import { type CollectionDto, type CollectionJobResponse, formatBytes } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronLeft,
  CircleAlert,
  CircleArrowUp,
  Copy,
  FolderInput,
  Map as MapIcon,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { CarryOn } from "@/features/learning/carry-on";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { languageName, sizeText } from "../explore/catalog";
import { DownloadDialog } from "../explore/download-dialog";
import { useCatalog } from "../explore/use-catalog";
import { BookContents, firstChapter, useBookContents } from "./book-contents";
import { useCollection } from "./collection-data";
import { MoveCollectionDialog, RemoveCollectionDialog } from "./collection-dialogs";
import { CollectionJobStatus, useCollectionActivity } from "./collection-job";
import { chapterCount, filesReachable, isAudiobook, isBook, kindLabel, openTarget, plainText } from "./collection-meta";

// An audiobook's page is its player, in place of a book's contents.
const AudiobookPanel = lazy(() => import("../audiobooks/audiobook-panel"));

const collectionsTab = "/library?tab=collections";

function BackLink({ audiobook = false }: { audiobook?: boolean }) {
  return (
    <Link
      // An audiobook is found in the Library under Type: Audiobooks, so that is where back leads.
      to={audiobook ? "/library?type=audio" : collectionsTab}
      className="-ml-1 mb-5 inline-flex items-center gap-1 rounded-control text-small text-ink-muted hover:text-ink max-md:min-h-11"
    >
      <ChevronLeft aria-hidden className="size-4" /> {audiobook ? "Audiobooks" : "Collections"}
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-small text-ink">{children}</dd>
    </div>
  );
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

async function copyText(value: string): Promise<boolean> {
  try {
    // Not available when Outpost is reached over plain http on a local network.
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the older way.
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

function Checksum({ value }: { value: string }) {
  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 font-mono text-[0.8125rem] leading-5 break-all">{value}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy checksum"
        className="-my-1 shrink-0"
        onClick={async () => {
          if (await copyText(value)) toast.success("Checksum copied");
          else toast.error("The checksum could not be copied. Select it and copy it by hand.");
        }}
      >
        <Copy />
      </Button>
    </span>
  );
}

function Details({ collection }: { collection: CollectionDto }) {
  const storage = useStorage();
  const location = storage.data?.locations.find((item) => item.id === collection.locationId);
  const meta = collection.meta;
  const published = text(meta.publishedAt) ? Date.parse(String(meta.publishedAt)) : Number.NaN;
  const zim = (typeof meta.zim === "object" && meta.zim !== null ? meta.zim : {}) as Record<string, unknown>;
  const articles = typeof zim.articleCount === "number" && zim.articleCount > 1 ? zim.articleCount : null;
  const licenceNote = text(meta.licenseNote);
  const homepage = text(meta.homepage);
  const publishedOn = Number.isFinite(published) ? formatDate(published) : null;

  return (
    <dl className="border-y border-border">
      <Fact label="Kind">{kindLabel(collection)}</Fact>
      {collection.publisher ? <Fact label="Publisher">{collection.publisher}</Fact> : null}
      {collection.language ? <Fact label="Language">{languageName(collection.language)}</Fact> : null}
      {collection.version ? <Fact label="Version">{collection.version}</Fact> : null}
      {publishedOn ? <Fact label="Published">{publishedOn}</Fact> : null}
      {articles ? (
        <Fact label="Articles">
          <span className="tabular">{formatNumber(articles)}</span>
        </Fact>
      ) : null}
      {collection.license ? (
        <Fact label="Licence">
          {collection.license}
          {licenceNote ? <span className="mt-0.5 block text-ink-muted">{licenceNote}</span> : null}
        </Fact>
      ) : null}
      {collection.attribution ? <Fact label="Attribution">{plainText(collection.attribution)}</Fact> : null}
      {homepage ? (
        <Fact label="Source">
          <a href={homepage} target="_blank" rel="noreferrer noopener" className="break-all text-primary underline underline-offset-2">
            {homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        </Fact>
      ) : null}
      <Fact label="Size">
        <span className="tabular">{formatBytes(collection.sizeBytes)}</span>
      </Fact>
      <Fact label="Installed">{formatDateTime(collection.installedAt)}</Fact>
      <Fact label="Storage location">
        <Link to="/storage" className="text-primary underline underline-offset-2">
          {collection.locationName}
        </Link>
        <span className={collection.locationAvailable ? "text-ink-muted" : "text-warning"}>
          {collection.locationAvailable ? ", connected" : ", not connected"}
        </span>
      </Fact>
      <Fact label="Path">
        <span className="font-mono text-[0.8125rem] leading-5 break-all">
          {location ? `${location.path.replace(/\/$/, "")}/${collection.relPath}` : collection.relPath}
        </span>
      </Fact>
      <Fact label="SHA-256 checksum">
        {collection.sha256 ? (
          <Checksum value={collection.sha256} />
        ) : (
          <span className="text-ink-muted">Not recorded yet. Checking the files records one.</span>
        )}
      </Fact>
      <Fact label="Last checked">
        {collection.verifiedAt ? formatDateTime(collection.verifiedAt) : <span className="text-ink-muted">Never</span>}
      </Fact>
    </dl>
  );
}

function LoadingCollection() {
  return (
    <Page width="reading" aria-busy>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-8 w-80 max-w-full" />
      <Skeleton className="mt-4 h-4" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-8 grid gap-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-5" />
        ))}
      </div>
    </Page>
  );
}

export default function CollectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useCollection(id);
  const catalog = useCatalog();
  const activity = useCollectionActivity(id ?? "");
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [updating, setUpdating] = useState(false);
  // Asked for only when the collection is a book; the contents below share the answer.
  const first = firstChapter(useBookContents(id, query.data ? isBook(query.data) : false).data);

  const verify = useMutation({
    mutationFn: () => api.post<CollectionJobResponse>(`/api/collections/${id}/verify`),
    onSuccess: ({ job }) => {
      activity.follow(job);
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isPending) return <LoadingCollection />;
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page width="reading">
        <BackLink />
        {missing ? (
          <>
            <h1 className="font-title text-title text-ink">This collection is not in the library</h1>
            <p className="mt-2 text-ink-muted">
              It may have been removed. Everything installed is listed under Collections, and anything in the catalogue can be downloaded
              again from Explore.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="primary">
                <Link to={collectionsTab}>See collections</Link>
              </Button>
              <Button asChild>
                <Link to="/explore">Open Explore</Link>
              </Button>
            </div>
          </>
        ) : (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        )}
      </Page>
    );
  }

  const collection = query.data;
  const book = isBook(collection);
  const audiobook = isAudiobook(collection);
  // A book is read from its first chapter; an audiobook is played on this page; everything else from wherever its kind is used.
  const target = audiobook
    ? null
    : book
      ? first
        ? { to: `/library/documents/${first.documentId}`, label: "Start reading" }
        : null
      : openTarget(collection);
  const reachable = filesReachable(collection);
  const away = !collection.locationAvailable;
  const entry = collection.catalogEntryId ? catalog.data?.entries.find((item) => item.id === collection.catalogEntryId) : undefined;
  // The catalogue is where a new copy comes from: a newer version, or the same one when the file has gone missing.
  const canFetchAgain = entry && entry.status === "installed" && entry.availability !== "unavailable";
  const TargetIcon = collection.kind === "zim" || book ? BookOpen : MapIcon;

  return (
    <Page width="reading">
      <BackLink audiobook={audiobook} />
      <h1 className="font-title text-title text-ink">{collection.title}</h1>
      {collection.description ? <p className="mt-2 text-body text-ink-muted">{collection.description}</p> : null}

      <div className="mt-5 grid gap-3 empty:hidden">
        {away ? (
          <Notice tone="warning" icon={<Unplug />} title={`“${collection.locationName}” is not connected`}>
            This collection cannot be {collection.kind === "zim" ? "read, " : ""}checked or moved until its storage location is back. Its
            details are kept here, and Outpost picks it up again as soon as the drive or share is reconnected.
          </Notice>
        ) : collection.status === "missing" ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            title={`The file is missing from “${collection.locationName}”`}
            action={
              canFetchAgain ? (
                <Button size="sm" onClick={() => setUpdating(true)}>
                  Download again
                </Button>
              ) : undefined
            }
          >
            Outpost expected it at the path below. Put the file back and check the files, or download it again.
          </Notice>
        ) : collection.status === "damaged" ? (
          <Notice tone="danger" icon={<CircleAlert />} title="The file no longer matches its checksum">
            It may be corrupted. Restore it from a backup and check the files again, or remove this collection and download it again from
            Explore.
          </Notice>
        ) : null}

        {collection.updateAvailable && entry && !away && collection.status !== "missing" ? (
          <Notice
            tone="info"
            icon={<CircleArrowUp />}
            title="A newer version is available"
            action={
              canFetchAgain ? (
                <Button size="sm" onClick={() => setUpdating(true)}>
                  Update
                </Button>
              ) : undefined
            }
          >
            {entry.version ? `Version ${entry.version}` : "A newer version"} is listed in the catalogue,{" "}
            <span className="tabular">{sizeText(entry)}</span>. The one installed keeps working until the new one is in place.
          </Notice>
        ) : null}
      </div>

      {audiobook ? (
        <Suspense fallback={<p className="mt-6 text-small text-ink-muted">Loading the player…</p>}>
          <AudiobookPanel collectionId={collection.id} />
        </Suspense>
      ) : null}

      <div className={audiobook ? "mt-8 flex flex-wrap items-center gap-2" : "mt-5 flex flex-wrap items-center gap-2"}>
        {target ? (
          reachable ? (
            <Button asChild variant="primary">
              <Link to={target.to}>
                <TargetIcon /> {target.label}
              </Link>
            </Button>
          ) : (
            <Button variant="primary" disabled>
              <TargetIcon /> {target.label}
            </Button>
          )
        ) : null}
        <Button onClick={() => verify.mutate()} loading={verify.isPending} disabled={away || activity.busy}>
          {verify.isPending ? null : <ShieldCheck />} Check files
        </Button>
        <Button onClick={() => setMoving(true)} disabled={away || activity.busy || collection.status !== "installed"}>
          <FolderInput /> Move
        </Button>
        <Button variant="danger-ghost" onClick={() => setRemoving(true)} disabled={activity.busy} className="md:ml-auto">
          <Trash2 /> Remove
        </Button>
      </div>
      {collection.kind === "zim" && reachable ? <CarryOn collectionId={collection.id} className="mt-4" /> : null}
      {activity.busy ? (
        <p className="mt-2 text-small text-ink-muted">Checking, moving and removing wait until the work below has finished.</p>
      ) : null}

      <CollectionJobStatus activity={activity} className="mt-6" />

      {book && !audiobook ? <BookContents collectionId={collection.id} readable={reachable} expected={chapterCount(collection)} /> : null}

      <section className="mt-8" aria-labelledby="collection-details">
        <h2 id="collection-details" className="mb-2 text-lead font-semibold text-ink">
          Details
        </h2>
        <Details collection={collection} />
      </section>

      <MoveCollectionDialog collection={collection} activity={activity} open={moving} onOpenChange={setMoving} />
      <RemoveCollectionDialog
        collection={collection}
        open={removing}
        onOpenChange={setRemoving}
        onRemoved={() => navigate(collectionsTab)}
      />
      <DownloadDialog
        entry={entry}
        open={updating}
        onOpenChange={setUpdating}
        replaces={collection.status === "missing" ? "missing" : "older"}
        onAdded={(response) => {
          // Something that ships with Outpost is replaced on the spot: this page's record has
          // just been removed, and the new edition is a collection of its own.
          toast.success(`“${collection.title}” is up to date`);
          navigate(`/library/collections/${response.collectionId}`, { replace: true });
        }}
        onStarted={() => {
          toast.success(`Downloading “${collection.title}”`, {
            description: "Progress is under Downloads.",
            action: { label: "Open Downloads", onClick: () => navigate("/downloads") },
          });
        }}
      />
    </Page>
  );
}
