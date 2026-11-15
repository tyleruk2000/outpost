/**
 * The lamp: one line at the foot of the spine that says how things stand. It is the
 * only place the amber signal colour lives permanently, and it is steady, not blinking.
 */
import { Link } from "react-router";
import { useServerConnection } from "@/lib/events";
import { useActiveJobs, useStorage } from "@/lib/queries";
import { cn, plural } from "@/lib/utils";

type Tone = "quiet" | "busy" | "warning" | "down";

export function useStationStatus(): { tone: Tone; label: string; to: string } {
  const connected = useServerConnection();
  const storage = useStorage();
  const jobs = useActiveJobs();

  if (!connected) return { tone: "down", label: "Server not responding", to: "/settings" };
  const away = storage.data?.locations.filter((location) => location.status === "unavailable") ?? [];
  if (away.length > 0) {
    return {
      tone: "warning",
      label: away.length === 1 ? `${away[0]!.name} is disconnected` : `${away.length} drives are disconnected`,
      to: "/storage",
    };
  }
  const running = jobs.data?.filter((job) => job.state === "running" || job.state === "queued") ?? [];
  const downloads = running.filter((job) => job.queue === "download");
  if (downloads.length > 0) return { tone: "busy", label: `${plural(downloads.length, "download")} running`, to: "/downloads" };
  if (running.length > 0) return { tone: "busy", label: `${plural(running.length, "task")} running`, to: "/downloads" };
  return { tone: "quiet", label: "Ready offline", to: "/storage" };
}

export function Lamp({ collapsed }: { collapsed?: boolean }) {
  const status = useStationStatus();
  const glyph = {
    quiet: "bg-spine-ink-muted/60",
    busy: "bg-lamp shadow-[0_0_0_3px_color-mix(in_oklch,var(--lamp)_28%,transparent)]",
    warning: "bg-lamp",
    down: "bg-danger",
  }[status.tone];
  return (
    <Link
      to={status.to}
      title={collapsed ? status.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-control px-2.5 py-2 text-small text-spine-ink-muted transition-colors hover:bg-spine-raised hover:text-spine-ink",
        collapsed && "justify-center px-0",
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", glyph)} />
      <span className={cn("truncate", collapsed && "sr-only")}>{status.label}</span>
    </Link>
  );
}
