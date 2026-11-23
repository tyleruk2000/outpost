/**
 * "How search was tuned": how Outpost's search was measured and changed, step by step,
 * with the numbers measured at each step and the arithmetic behind each measure, for a
 * person who wants to understand exactly how search works and how systems like it (and
 * machine learning models) are tuned. Under "How search works" in the navigation.
 *
 * The page's own figures are in data.ts; the one live figure, this Outpost's passages
 * and whether search by meaning is on, comes from the server.
 */
import type { SemanticStatus } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ErrorState, JumpLinks, Page, PageHeader } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { formatNumber, plural } from "@/lib/utils";
import { linkClass } from "./parts";
import { KeywordSection, MeasureSection, StartSection } from "./sections-start";
import { FormulaSection, LessonsSection, MeaningSection, SpeedSection, StepsSection, SummarySection } from "./sections-tuning";

const SECTIONS = [
  { id: "start", label: "Where it started" },
  { id: "measure", label: "Measuring search" },
  { id: "keywords", label: "Keyword search" },
  { id: "steps", label: "The changes" },
  { id: "formula", label: "The final score" },
  { id: "meaning", label: "Search by meaning" },
  { id: "speed", label: "Speed" },
  { id: "lessons", label: "Lessons" },
  { id: "summary", label: "Before and after" },
];

function useStatus() {
  return useQuery({
    queryKey: ["semantic", "status", "tuned"],
    queryFn: () => api.get<SemanticStatus>("/api/semantic/status"),
  });
}

/** This Outpost's own figures beside the Pi's, read from the server. */
function OnThisOutpost() {
  const status = useStatus();
  const data = status.data;
  return (
    <section aria-labelledby="here-title" className="mb-10 rounded-panel border border-border bg-surface px-4 py-4 sm:px-5">
      <h2 id="here-title" className="text-body font-semibold text-ink">
        This Outpost, beside the Pi measured here
      </h2>
      {status.isPending ? (
        <div className="mt-3 grid gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
      ) : status.isError || !data ? (
        <div className="mt-3">
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        </div>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-small sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-ink-muted">Passages here</dt>
          <dd className="tabular text-ink">
            {data.totalChunks === 0 ? "None yet: add documents or write a page to search" : plural(data.totalChunks, "passage")}
            <span className="text-ink-muted"> · the Pi: 59,351</span>
          </dd>
          <dt className="text-ink-muted">Search by meaning here</dt>
          <dd className="text-ink">
            {data.enabled
              ? `On, ${formatNumber(data.embeddedChunks)} of ${plural(data.totalChunks, "passage")} read`
              : "Off: keyword search only"}
          </dd>
        </dl>
      )}
    </section>
  );
}

export default function HowSearchTunedPage() {
  return (
    <Page width="reading">
      <PageHeader
        title="How search was tuned"
        description="How Outpost’s search was measured and improved, one change at a time, with the numbers at each step. The same method is how ranking systems and machine learning models are tuned."
      />
      <div className="prose mb-6">
        <p>
          This page follows on from{" "}
          <Link to="/search/how-it-works" className={linkClass}>
            How search works
          </Link>{" "}
          and{" "}
          <Link to="/search/how-meaning-works" className={linkClass}>
            How search by meaning works
          </Link>
          . It was measured on a Raspberry Pi 5 with a real household library, on 22 and 23 November 2026.
        </p>
      </div>
      <OnThisOutpost />
      <JumpLinks label="On this page" items={SECTIONS} className="mt-0" />
      <StartSection />
      <MeasureSection />
      <KeywordSection />
      <StepsSection />
      <FormulaSection />
      <MeaningSection />
      <SpeedSection />
      <LessonsSection />
      <SummarySection />
    </Page>
  );
}
