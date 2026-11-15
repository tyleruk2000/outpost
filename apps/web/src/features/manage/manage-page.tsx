import { ArrowLeft } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { JobAccount } from "./job-account";
import { type ManageView, useCleanup } from "./manage-data";

const SpaceView = lazy(() => import("./space-view"));
const ItemsView = lazy(() => import("./items-view"));
const LeftoversView = lazy(() => import("./leftovers-view"));
const CleanupView = lazy(() => import("./cleanup-view"));

const views: Array<{ value: ManageView; label: string }> = [
  { value: "space", label: "Space" },
  { value: "installed", label: "Installed" },
  { value: "leftovers", label: "Leftovers" },
  { value: "clean-up", label: "Clean up" },
];

const fallback = (
  <div className="mt-6 grid gap-3" aria-busy>
    <Skeleton className="h-12" />
    <Skeleton className="h-12" />
    <Skeleton className="h-12" />
  </div>
);

/**
 * One place to see everything Outpost is storing, remove what is not wanted, and clean
 * up. A page under Storage, because that is where space is already talked about; the
 * four views are the four questions a person arrives with.
 */
export default function ManagePage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const view = views.find((entry) => entry.value === asked)?.value ?? "space";
  const cleanup = useCleanup();

  return (
    <Page>
      <Link
        to="/storage"
        className="-ml-1 mb-3 inline-flex items-center gap-1.5 rounded-control px-1 py-1 text-small text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" /> Storage
      </Link>
      <PageHeader
        title="Manage and clean up"
        description="Everything Outpost is storing, in one place. See what takes the space, remove or move what is installed, and clear what is left over. Nothing here is removed until you choose it and confirm."
      />

      {cleanup.isError ? <ErrorState error={cleanup.error} onRetry={() => cleanup.refetch()} /> : null}
      {cleanup.data ? <JobAccount status={cleanup.data} /> : null}

      <Tabs
        value={view}
        onValueChange={(next) =>
          setParams(
            (current) => {
              const updated = new URLSearchParams(current);
              if (next === "space") updated.delete("view");
              else updated.set("view", next);
              return updated;
            },
            { replace: true },
          )
        }
      >
        <TabsList aria-label="What to look at">
          {views.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="space" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <SpaceView />
          </Suspense>
        </TabsContent>
        <TabsContent value="installed" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <ItemsView busy={Boolean(cleanup.data?.active)} />
          </Suspense>
        </TabsContent>
        <TabsContent value="leftovers" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <LeftoversView />
          </Suspense>
        </TabsContent>
        <TabsContent value="clean-up" className="focus:outline-none">
          <Suspense fallback={fallback}>
            <CleanupView status={cleanup.data} loading={cleanup.isPending} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
