import { formatBytes } from "@outpost/shared";
import { Link } from "react-router";
import { Contour } from "@/components/contour";
import { Page } from "@/components/page";
import { StorageBar } from "@/components/storage-bar";
import { Skeleton } from "@/components/ui/misc";
import { useStorage } from "@/lib/queries";

export default function HomePage() {
  const storage = useStorage();
  const locations = storage.data?.locations ?? [];
  const free = locations.filter((location) => location.status === "available").reduce((sum, location) => sum + (location.freeBytes ?? 0), 0);

  return (
    <>
      <div className="relative isolate overflow-hidden border-b border-border">
        <Contour seed={5} columns={120} rows={26} levels={13} className="absolute inset-0 -z-10 size-full [mask-image:linear-gradient(95deg,transparent_25%,black_85%)]" />
        <div className="mx-auto w-full max-w-[70rem] px-5 pt-10 pb-9 md:px-10 md:pt-16 md:pb-12">
          <h1 className="font-title text-display text-ink">Your library</h1>
          <p className="mt-3 max-w-[52ch] text-lead text-ink-muted">
            {storage.isPending ? <Skeleton className="h-5 w-80 max-w-full" /> : `${formatBytes(free)} free across ${locations.length} storage ${locations.length === 1 ? "location" : "locations"}.`}
          </p>
        </div>
      </div>
      <Page className="md:pt-10">
        <ul className="grid max-w-xl gap-5">
          {locations.map((location) => (
            <li key={location.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-4 text-small">
                <Link to="/storage" className="font-medium text-ink hover:underline">
                  {location.name}
                </Link>
                <span className="tabular text-ink-muted">{location.status === "available" ? `${formatBytes(location.freeBytes)} free` : "Disconnected"}</span>
              </div>
              <StorageBar location={location} usage={location.usage} />
            </li>
          ))}
        </ul>
      </Page>
    </>
  );
}
