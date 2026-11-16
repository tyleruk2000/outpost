/**
 * The recording as the rest of the app sees it. A recording goes on while its maker
 * reads a document or writes a note, so every other screen says that it is running and
 * leads back to the map; and a recording that had to wait for Outpost is announced
 * when it is finally saved, whichever screen is open then.
 */
import type { TrackDto } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServerConnection } from "@/lib/events";
import { cn, plural } from "@/lib/utils";
import { mapsKeys } from "../data";
import { formatDistance } from "../lib/geo";
import { useRecorder } from "./browser";

export function RecordingIndicator() {
  const { recorder, state } = useRecorder();
  const client = useQueryClient();
  const navigate = useNavigate();
  const onMaps = useLocation().pathname === "/maps";

  useEffect(() => {
    void recorder.init();
  }, [recorder]);

  // The moment the server is heard from again, anything that was waiting for it is sent.
  const connected = useServerConnection();
  useEffect(() => {
    if (connected) void recorder.retryNow();
  }, [connected, recorder]);

  useEffect(
    () =>
      recorder.onSaved((track) => {
        client.setQueryData<{ tracks: TrackDto[] }>(mapsKeys.tracks, (current) =>
          current && !current.tracks.some((item) => item.id === track.id) ? { tracks: [track, ...current.tracks] } : current,
        );
        void client.invalidateQueries({ queryKey: ["maps"] });
        toast.success(
          `“${track.name}” is saved to your routes.`,
          onMaps ? undefined : { action: { label: "Show on the map", onClick: () => navigate(`/maps?track=${track.id}`) } },
        );
      }),
    [recorder, client, navigate, onMaps],
  );

  // The Maps screen shows all of this itself.
  if (onMaps) return null;
  const live = state.phase === "recording";
  const words =
    state.phase === "recording"
      ? `Recording a track: ${state.totals.points < 2 ? "nothing yet" : `${formatDistance(state.totals.distanceMeters)} so far`}. It goes on while this screen is on and Outpost is in front.`
      : state.phase === "paused"
        ? "A recording is paused."
        : state.phase === "stopped"
          ? "A recording is stopped and has not been saved yet."
          : state.unfinished
            ? "An unfinished recording is kept on this device."
            : state.pending.length > 0
              ? `${plural(state.pending.length, "recording")} on this device ${state.pending.length === 1 ? "is" : "are"} waiting to be saved to Outpost.`
              : null;
  if (!words) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5 text-small text-ink md:px-6"
    >
      <p className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", live ? "bg-lamp" : "bg-ink-faint")} />
        <span className="tabular">{words}</span>
      </p>
      <Button asChild size="sm">
        <Link to="/maps">Open the map</Link>
      </Button>
    </div>
  );
}
