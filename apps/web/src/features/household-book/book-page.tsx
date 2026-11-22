/**
 * The household book: the questions, and the book made from the answers and from what
 * Outpost holds. Made on this device when "Make the book" is pressed, then saved, added to
 * the library or shared like every PDF Outpost makes. Outpost keeps the answers as a draft
 * and a record of the last book made, so the next book says what changed since.
 */
import {
  BOOK_STEPS,
  type BookAnswers,
  type BookFacts,
  type BookStepId,
  bookPlanIds,
  DEFAULT_BOOK_ANSWERS,
  localDay,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { BookOpen, ListChecks, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useOutlook } from "@/features/emergency-plans/data";
import type { BinderMap } from "@/features/household-papers/binder-map";
import { useContactsById } from "@/features/household-papers/data";
import { grabHousehold, grabPerson, useHouseholdSources } from "@/features/household-papers/household-data";
import { paperHomePlace } from "@/features/household-papers/paper-household";
import { libraryQuestion } from "@/features/household-papers/paper-pdf";
import { ForHousehold } from "@/features/households/for-household";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { useMapOverview, useMapSources } from "@/features/maps/data";
import { regionsCacheKey } from "@/features/maps/lib/tiles";
import { measureOf, renderPdf } from "@/features/print-kit";
import { PdfPagesPreview } from "@/features/print-kit/preview";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDate, plural } from "@/lib/utils";
import { bookMapPlaces, bookRepeaterGroups, makeBook } from "./book";
import { sourcesWords } from "./book-line";
import { useBook, useBookFacts, useBookMade, useSaveBook } from "./data";
import { BookWizard } from "./wizard";

/** Countries that print on US Letter; A4 everywhere else (as `likelyPaper` decides from the device's language). */
const LETTER_COUNTRIES = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "PA", "DO", "PR"]);
const PREVIEW_PAGES = 4;

export default function BookPage() {
  const book = useBook();
  const sources = useHouseholdSources();
  const outlook = useOutlook();
  const facts = useBookFacts(true);
  const save = useSaveBook();
  const made = useBookMade();
  // "?step=readiness": back from making a plan for a hazard, to the question it was made from.
  const [params] = useSearchParams();
  const [asking, setAsking] = useState<BookStepId | null>(() => BOOK_STEPS.find((each) => each.id === params.get("step"))?.id ?? null);
  const [result, setResult] = useState<{ pdf: MadePdf; bytes: Uint8Array; pages: number; medical: boolean } | null>(null);
  const [making, setMaking] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const mapSources = useMapSources();
  const overview = useMapOverview();

  const answers = book.data?.answers ?? DEFAULT_BOOK_ANSWERS;
  const destinationContacts = useContactsById(answers.destinations.map((destination) => destination.contactId ?? "").filter(Boolean));
  const country = facts.data?.home?.country ?? null;

  const from = useMemo(() => ({ what: "the household book", path: "/prepare/book" }), []);

  const saveAnswers = async (next: BookAnswers) => {
    // The first save takes the paper from the country home is in, where the person has not chosen one.
    const paper = book.data?.answersAt === null && country ? (LETTER_COUNTRIES.has(country) ? "letter" : "a4") : next.paper;
    await save.mutateAsync({ ...next, paper, baseAnswersAt: book.data?.answersAt ?? null });
    setResult(null);
  };

  /** The repeaters, their ranges and their maps, gathered from this Outpost before the book is made. */
  const gatherBookRepeaters = async (answers: BookAnswers, now: BookFacts) => {
    const { repeaterLocations } = await import("./book-repeaters");
    const { gatherMaps, gatherRanges, gatherRepeaters } = await import("./repeater-gather");
    const first = paperHomePlace(sources.which, now.home);
    const included = new Set(
      bookPlanIds(
        answers,
        sources.plans.map((each) => each.plan),
      ),
    );
    const plans = sources.plans.filter((each) => included.has(each.plan.id));
    const locations = repeaterLocations({
      answers,
      markers: sources.markers,
      mapped: bookMapPlaces(answers, sources.markers, plans, first).mapped,
      first,
      journeys: now.journeys,
    });
    if (locations.length === 0) return { repeaters: [], lists: [], ranges: {}, maps: {}, missing: null };
    const gathered = await gatherRepeaters(locations);
    if (!gathered) return { repeaters: null, lists: [], ranges: {}, maps: {}, missing: null };
    const groups = bookRepeaterGroups({
      answers,
      markers: sources.markers,
      plans: sources.plans,
      facts: now,
      which: sources.which,
      repeaters: gathered.repeaters,
    });
    setDrawing(true);
    try {
      const ranges = await gatherRanges(groups);
      const regions = overview.data?.regions ?? [];
      const drawn = await gatherMaps(
        groups,
        { sources: mapSources.data, regions, cacheKey: regionsCacheKey(regions), origin: window.location.origin },
        measureOf(answers.paper),
      ).catch(() => ({ maps: {}, missing: "This device could not draw the offline map under the repeaters." }));
      return { ...gathered, ranges, ...drawn };
    } finally {
      setDrawing(false);
    }
  };

  const make = async () => {
    if (!book.data) return;
    setMaking(true);
    try {
      const fresh = await facts.refetch();
      if (!fresh.data) throw fresh.error ?? new Error("What the book reads round home could not be read.");
      const at = new Date();
      const chosen = book.data.answers.sections;
      const home = fresh.data.home;
      // The map of home and the meeting points is drawn first, from the offline map on this device.
      let placesMap: BinderMap | null = null;
      const included = new Set(
        bookPlanIds(
          book.data.answers,
          sources.plans.map((each) => each.plan),
        ),
      );
      const mapped = bookMapPlaces(
        book.data.answers,
        sources.markers,
        sources.plans.filter((each) => included.has(each.plan.id)),
        paperHomePlace(sources.which, home),
      ).mapped;
      if (chosen.includes("places") && mapped.length > 0) {
        setDrawing(true);
        try {
          const { binderMap } = await import("@/features/household-papers/binder-map");
          const regions = overview.data?.regions ?? [];
          placesMap = await binderMap(
            mapped,
            { sources: mapSources.data, regions, cacheKey: regionsCacheKey(regions), origin: window.location.origin },
            book.data.answers.paper,
          );
        } catch {
          placesMap = null;
        } finally {
          setDrawing(false);
        }
      }
      // Repeaters round every place the book covers, from Outpost's own list (on this Outpost, not the internet),
      // with each one's range over the terrain installed and the offline map under each place.
      const repeaterInputs = chosen.includes("frequencies") ? await gatherBookRepeaters(book.data.answers, fresh.data) : null;
      const out = makeBook({
        answers: book.data.answers,
        facts: fresh.data,
        household: sources.supplies?.household ?? null,
        outlook: outlook.data?.outlook ?? null,
        missing: outlook.data?.missing ?? [],
        people: sources.people,
        opened: sources.opened,
        medicalContacts: sources.contacts,
        plans: sources.plans,
        emergencyContacts: sources.emergencyContacts,
        comms: sources.comms,
        markers: sources.markers,
        destinationContacts,
        entries: RADIO_FREQUENCIES,
        made: at,
        today: localDay(),
        previous: book.data.made,
        supplies: sources.supplies,
        grab: {
          people: sources.people.map((person) => grabPerson(person, sources.opened, sources.contacts)),
          household: grabHousehold(sources.plans, sources.emergencyContacts, sources.which, sources.comms, sources.travel),
        },
        which: sources.which,
        travel: sources.travel,
        repeaters: repeaterInputs ? repeaterInputs.repeaters : [],
        repeaterLists: repeaterInputs?.lists,
        repeaterRanges: repeaterInputs?.ranges,
        repeaterMaps: repeaterInputs?.maps,
        repeaterMapsMissing: repeaterInputs?.missing,
        placesMap: placesMap ? { block: placesMap.block, pictures: placesMap.pictures, missing: placesMap.missing } : null,
      });
      const printed = await renderPdf(out.document);
      setResult({
        pdf: madePdf(
          printed.bytes,
          `Household book${sources.which?.several ? `: ${sources.which.name}` : ""}, ${formatDate(at.getTime())}`,
          "Household book",
          from,
        ),
        bytes: printed.bytes,
        pages: printed.pages,
        medical: book.data.answers.sections.includes("people"),
      });
      made.mutate(
        { pages: printed.pages, sections: out.sections, summary: out.summary, fingerprints: book.data.fingerprints },
        { onError: (error) => notify.error(errorMessage(error)) },
      );
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setMaking(false);
    }
  };

  const loading = book.isPending || sources.pending;
  const failed = book.error ?? sources.error;

  return (
    <Page width="reading">
      <PageHeader
        title="Household book"
        description="A few questions about your household, and a printable book made from the answers and from what Outpost holds: what to do first, your people and places, help near home, first aid, water, journeys on foot, checklists. Every piece of advice in it is quoted from a named source."
      />
      <ForHousehold className="-mt-6 mb-8" />
      {loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      ) : failed ? (
        <ErrorState
          error={failed}
          onRetry={() => {
            void book.refetch();
            sources.retry();
          }}
        />
      ) : asking ? (
        <BookWizard
          answers={answers}
          household={sources.supplies?.household ?? null}
          markers={sources.markers}
          country={country}
          sheets={new Set(sources.people.filter((person) => person.sheet && person.memberId).map((person) => person.memberId!))}
          saving={save.isPending}
          save={saveAnswers}
          onDone={() => setAsking(null)}
          startAt={asking}
        />
      ) : book.data?.answersAt === null ? (
        <EmptyState
          title="Start with the questions"
          action={
            <Button variant="primary" onClick={() => setAsking("people")}>
              <ListChecks /> Start the questions
            </Button>
          }
        >
          Six short steps: who lives here, where home is, where you would go and meet, vehicles and radios, how long to be ready for and
          which hazards matter, and what goes in the book. Your answers are kept as you go, so you can stop and come back.
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {book.data?.made && book.data.stale.length > 0 ? (
            <Notice
              tone="warning"
              icon={<TriangleAlert />}
              title={
                book.data.made.fromBinder
                  ? "The household binder last made is older than what is in it"
                  : "The book last made is older than what is in it"
              }
            >
              Made on {formatDate(book.data.made.madeAt)}. Since then its {sourcesWords(book.data.stale)} changed. Make it again and replace
              the printed copy.
            </Notice>
          ) : null}
          <Summary answers={answers} madeAt={book.data?.made?.madeAt ?? null} pages={book.data?.made?.pages ?? null} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" loading={making} onClick={() => void make()}>
              <BookOpen /> {drawing ? "Drawing the map" : "Make the book"}
            </Button>
            <Button onClick={() => setAsking("people")}>
              <ListChecks /> Change the answers
            </Button>
          </div>
          {facts.data && !facts.data.home ? (
            <Notice tone="info" title="No home is marked">
              Help near home, places to keep away from, local risks and journeys need a home. Mark one in the questions (step 2).
            </Notice>
          ) : null}
          {result ? (
            <div className="grid gap-4">
              <PdfActions pdf={result.pdf} lead="save" confirm={libraryQuestion(result.medical)} />
              <p className="text-small text-ink-muted">
                {plural(result.pages, "page")}. The first {Math.min(PREVIEW_PAGES, result.pages)} as they print:
              </p>
              <PdfPagesPreview
                bytes={result.bytes}
                pages={PREVIEW_PAGES}
                label={(page) => `Page ${page} of ${result.pages} as it prints`}
              />
            </div>
          ) : null}
        </div>
      )}
    </Page>
  );
}

function Summary({ answers, madeAt, pages }: { answers: BookAnswers; madeAt: number | null; pages: number | null }) {
  const lines = [
    `${answers.days} days to be ready for`,
    answers.destinations.length > 0 ? plural(answers.destinations.length, "place to go to", "places to go to") : "No places to go to",
    answers.meetingPoints.length > 0 ? plural(answers.meetingPoints.length, "meeting point") : "No meeting points",
    plural(answers.hazards.length, "hazard"),
    `${plural(answers.sections.length, "section")}, on ${answers.paper === "letter" ? "US Letter" : "A4"}`,
  ];
  return (
    <div className="grid gap-2">
      <p className="text-body text-ink">
        {madeAt
          ? `Last made on ${formatDate(madeAt)}${pages ? `, ${plural(pages, "page")}` : ""}. Make it again whenever the household, its plans or its places change: the new book says what changed since.`
          : "Not made yet. Once it is, make it again whenever the household, its plans or its places change: the new book says what changed since."}
      </p>
      <Rows>
        {lines.map((line) => (
          <li key={line} className="py-1.5 text-small text-ink-muted">
            {line}
          </li>
        ))}
      </Rows>
    </div>
  );
}
