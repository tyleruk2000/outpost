/**
 * One calm line on the plans list and on "Use now" when Outpost holds a warning for the
 * home place: what the Met Office or the Environment Agency had in force when Outpost
 * last checked, in the publisher's own words, how long ago, and a link to Weather and
 * hazards. It fetches nothing (`GET /api/weather/home-warnings` reads what was kept),
 * says nothing when there is no warning, no home place or no reachable server, and
 * never tells anyone what to do.
 *
 * A copy too old to be worth a line is left out: Met Office warnings fetched more than
 * a day ago (they are issued, changed and ended at any time), and flood warnings
 * fetched more than twelve hours ago (the Environment Agency updates them every 15
 * minutes). A Met Office warning whose own stated period has ended is never shown (the
 * server leaves it out). These limits are Outpost's choice, not the publishers'.
 */
import { ageWords, type HomeWarningsResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const HOUR = 3_600_000;
export const WARNING_LINE_USABLE_FOR = { weather: 24 * HOUR, flood: 12 * HOUR } as const;

const LEVEL_RANK = { red: 3, amber: 2, yellow: 1 } as const;

export interface WarningLine {
  /** The publisher's words for the warning, quoted. */
  words: string;
  /** How long ago Outpost fetched it: "3 hours ago". */
  age: string;
  /** How many more are held besides the one named. */
  more: number;
}

/** The one line to show, or null. Pure, for the tests. */
export function warningLineOf(response: HomeWarningsResponse | undefined, now: number): WarningLine | null {
  if (!response?.place) return null;
  const candidates: Array<{ rank: number; words: string; fetchedAt: number }> = [];
  if (response.fetchedAt !== null && now - response.fetchedAt <= WARNING_LINE_USABLE_FOR.weather)
    for (const item of response.weather)
      candidates.push({ rank: item.level ? LEVEL_RANK[item.level] : 1, words: `“${item.title}”`, fetchedAt: response.fetchedAt });
  if (response.floodFetchedAt !== null && now - response.floodFetchedAt <= WARNING_LINE_USABLE_FOR.flood)
    for (const warning of response.flood)
      candidates.push({
        // 1 is a severe flood warning, 3 a flood alert, as the Agency numbers them.
        rank: 4 - warning.severityLevel,
        words: `The Environment Agency’s “${warning.severity}” for ${warning.area}`,
        fetchedAt: response.floodFetchedAt,
      });
  if (candidates.length === 0) return null;
  const [first] = [...candidates].sort((a, b) => b.rank - a.rank || b.fetchedAt - a.fetchedAt);
  const ms = Math.max(0, now - first!.fetchedAt);
  return { words: first!.words, age: ms < 60_000 ? "just now" : `${ageWords(ms)} ago`, more: candidates.length - 1 };
}

export const useHomeWarnings = () =>
  useQuery({
    queryKey: ["weather", "home-warnings"],
    queryFn: () => api.get<HomeWarningsResponse>("/api/weather/home-warnings"),
    retry: false,
  });

export function HomeWarningLine({ className }: { className?: string }) {
  const warnings = useHomeWarnings();
  const line = warningLineOf(warnings.data, warnings.data?.now ?? Date.now());
  if (!line) return null;
  return (
    <p className={cn("flex items-start gap-2 text-small text-ink", className)} data-testid="home-warning-line">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <span>
        {line.words} was in force for your area when Outpost last checked, {line.age}
        {line.more > 0 ? ` (and ${line.more} more)` : ""}:{" "}
        <Link to="/prepare/weather?view=warnings" className="text-primary underline underline-offset-2">
          open Weather and hazards
        </Link>
      </span>
    </p>
  );
}
