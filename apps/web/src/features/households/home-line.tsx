/**
 * Home's line for the household, above its prepared lines: which household they are for,
 * when there are several, and for a portable one where it is now with "We're here now".
 * With one household that stays put there is nothing to say, and nothing is drawn.
 */
import { House, LocateFixed } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { timeAgo } from "@/lib/utils";
import { HOUSEHOLDS_PATH } from "./for-household";
import { HereDialog } from "./here";
import { useHousehold } from "./use-household";
import { positionName } from "./words";

const link = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";
const line = "flex items-start gap-2 py-1.5 text-body text-ink-muted md:py-0.5";

export function HouseholdHomeLine({ className }: { className?: string }) {
  const { data } = useHousehold();
  const [hereOpen, setHereOpen] = useState(false);
  if (!data) return null;
  const { household, several } = data;
  const portable = household.kind === "portable";
  if (!several && !portable) return null;
  return (
    <div className={className}>
      <p className={line} data-testid="household-home-line">
        {portable ? (
          <LocateFixed aria-hidden className="mt-[0.3em] size-4 shrink-0" />
        ) : (
          <House aria-hidden className="mt-[0.3em] size-4 shrink-0" />
        )}
        <span>
          {several ? (
            <>
              For{" "}
              <Link to={`${HOUSEHOLDS_PATH}/${household.id}`} className={link}>
                {household.name}
              </Link>
              {portable ? ", " : null}
            </>
          ) : null}
          {portable
            ? household.here
              ? `${several ? "w" : "W"}here it is now: ${positionName(household.here)}, as of ${timeAgo(household.here.at)}`
              : `${several ? "w" : "W"}here it is now is not set`
            : null}
          {portable ? (
            <>
              {" "}
              ·{" "}
              <button type="button" className={`${link} font-medium max-md:min-h-11`} onClick={() => setHereOpen(true)}>
                We're here now
              </button>
            </>
          ) : null}
          {several ? (
            <>
              {" "}
              ·{" "}
              <Link to={HOUSEHOLDS_PATH} className={link}>
                Change
              </Link>
            </>
          ) : null}
        </span>
      </p>
      {portable ? <HereDialog household={household} open={hereOpen} onOpenChange={setHereOpen} /> : null}
    </div>
  );
}
