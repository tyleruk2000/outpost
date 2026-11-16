/**
 * The line-of-sight tool's card over the map. While an end is being chosen it says
 * what a press on the map will do; once both are chosen it gives the answer in a line,
 * for when the panel that holds the whole of it is out of sight (a phone with the
 * sheet lowered, a desktop with the panel closed).
 */
import { Ban, CircleAlert, CircleCheck, CircleQuestionMark, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { MapCard } from "../map-chrome";
import type { SightReading } from "./sight";
import type { Sight } from "./use-sight";

export const SIGHT_ICONS: Record<SightReading["tone"], typeof Ban> = {
  success: CircleCheck,
  warning: CircleAlert,
  danger: Ban,
  info: CircleQuestionMark,
};
/** The colour of the icon beside the answer; the words carry the answer itself. */
export const SIGHT_TONES: Record<SightReading["tone"], string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-ink-muted",
};

export function SightCard({
  sight,
  onUseCentre,
  onShowDetails,
  onDone,
  untitled,
}: {
  sight: Sight;
  /** Puts the end being chosen at the middle of the map: the way to choose one without a pointer. */
  onUseCentre?: () => void;
  /** Brings the panel with the whole answer into view. */
  onShowDetails: () => void;
  onDone: () => void;
  /**
   * On a phone the lowered sheet under this card already says "Line of sight" and has the button that
   * puts the tool down, so the card does not say or offer either again.
   */
  untitled?: boolean;
}) {
  const { picking, reading, profile } = sight;
  const Icon = reading ? SIGHT_ICONS[reading.tone] : CircleQuestionMark;
  return (
    <MapCard title="Line of sight" titleHidden={untitled} onClose={untitled ? undefined : onDone} closeLabel="Stop checking line of sight">
      {picking ? (
        <div aria-live="polite">
          <p className="mt-1 text-small text-ink-muted">
            {picking === "from"
              ? "Click or tap the map where the first antenna is: point A."
              : "Now click or tap where the other antenna is: point B."}{" "}
            Pressing a saved place puts the point exactly on it.
          </p>
          {onUseCentre ? (
            <Button size="sm" className="mt-2.5" onClick={onUseCentre}>
              <Crosshair /> Use the centre of the map
            </Button>
          ) : null}
        </div>
      ) : (
        <div aria-live="polite">
          {profile.isPending ? (
            <p className="mt-1 flex items-center gap-2 text-small text-ink-muted">
              <Spinner label="Reading the ground" /> Reading the ground between A and B
            </p>
          ) : profile.isError ? (
            <p className="mt-1 flex items-start gap-2 text-small text-ink">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" /> The ground between these points could not be read.
            </p>
          ) : reading ? (
            <p className="mt-1 flex items-start gap-2 text-small text-ink">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", SIGHT_TONES[reading.tone])} />
              <span>
                <span className="font-semibold">{reading.title}.</span> {reading.sentences[0]}
              </span>
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={onShowDetails}>
              Show the path and the details
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone} className="ml-auto">
              Done
            </Button>
          </div>
        </div>
      )}
    </MapCard>
  );
}
