/**
 * Home's one line about routine checks: there only when something is overdue or never
 * done. Read once (`GET /api/routine-checks`) and refreshed by `readiness.changed`.
 */
import { CalendarClock } from "lucide-react";
import { Link } from "react-router";
import { useRoutineChecks } from "./data";
import { overdueLine } from "./words";

export function ChecksHomeLine({ className }: { className?: string }) {
  const checks = useRoutineChecks();
  const line = checks.data ? overdueLine(checks.data.checks) : null;
  if (!line) return null;
  return (
    <div className={className}>
      <p className="flex items-start gap-2 py-1.5 text-body text-ink-muted md:py-0.5">
        <CalendarClock aria-hidden className="mt-[0.3em] size-4 shrink-0" />
        <span>
          Overdue:{" "}
          <Link to="/prepare/checks" className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
            {line}
          </Link>
        </span>
      </p>
    </div>
  );
}
