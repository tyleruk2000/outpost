import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "./ui/button";

/**
 * The build this tab is running: the name of the fingerprinted script it was started
 * from. Absent in development, where there is no such file and nothing to compare.
 */
export function runningBuild(root: Document = document): string | null {
  for (const script of root.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')) {
    const name = /\/assets\/(index-[A-Za-z0-9_-]+\.js)$/.exec(new URL(script.src, root.baseURI).pathname)?.[1];
    if (name) return name;
  }
  return null;
}

/**
 * A tab left open keeps running the app it loaded, however long ago. When the server
 * has since been updated, new screens and fixes are simply missing from it, with nothing
 * to say why. This asks the server now and then which build it serves, and when that is
 * no longer this one, offers a reload. It never reloads by itself: someone may be
 * half-way through writing a note.
 *
 * It does not poll. A new build means the server was restarted, which ends the
 * live-events stream; when the stream is back, every query is fetched again
 * (`lib/events.tsx`), this one with them.
 */
export function UpdateNotice({ running = runningBuild() }: { running?: string | null }) {
  const served = useQuery({
    queryKey: ["health", "web-build"],
    queryFn: () => api.get<{ web?: string | null }>("/api/health"),
    enabled: running !== null,
    staleTime: 60_000,
    refetchOnReconnect: true,
    retry: false,
  });
  if (running === null || !served.data?.web || served.data.web === running) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-warning-soft px-4 py-2.5 text-small text-ink md:px-6"
    >
      <p className="min-w-0 flex-1 basis-56">
        <span className="font-medium">Outpost has been updated.</span> This tab is still showing the earlier version, so newer screens may
        be missing. Reload to get them.
      </p>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw /> Reload
      </Button>
    </div>
  );
}
