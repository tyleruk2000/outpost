/**
 * The household binder: a chosen set of the printables as one PDF, with a contents page
 * and the date it was made from. Made on this device when "Make the binder" is pressed,
 * then saved, added to the library or shared like every PDF Outpost makes. Outpost keeps
 * a record of the binder last made, so that Home can say when it is older than what is
 * in it.
 */
import { BINDER_PARTS, type BinderPart, localDay } from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { BookCopy, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Skeleton } from "@/components/ui/misc";
import type { CardPaper } from "@/features/emergency-plans/cards";
import { useOutlook } from "@/features/emergency-plans/data";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import type { Sheet } from "@/features/maps/print/sheet";
import { errorMessage } from "@/lib/api";
import { useClockStyle } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import { type BinderSources, binderPages, partHolds } from "./binder";
import { partsWords } from "./binder-line";
import { useBinderMade, useBinderStatus } from "./data";
import { grabHousehold, grabPerson, useHouseholdSources } from "./household-data";
import { libraryQuestion, PaperPreview } from "./paper-pdf";
import { pdfOf, usePaperPdf } from "./use-paper-pdf";

const PARTS_KEY = "outpost.binder.parts";
const EPOCH = new Date(0);
const isParts = (value: unknown): value is BinderPart[] =>
  Array.isArray(value) && value.every((item) => BINDER_PARTS.some((part) => part.id === item));

export default function BinderPage() {
  const sources = useHouseholdSources();
  const outlook = useOutlook();
  const status = useBinderStatus();
  const made = useBinderMade();
  const style = useClockStyle();
  const [paper, setPaper] = useState<CardPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const [chosen, setChosen] = useState<BinderPart[]>(() =>
    readStored(
      PARTS_KEY,
      isParts,
      BINDER_PARTS.map((part) => part.id),
    ),
  );
  const [binder, setBinder] = useState<{ pages: Sheet[]; parts: BinderPart[]; made: Date } | null>(null);

  const household = useMemo(
    () => grabHousehold(sources.plans, sources.emergencyContacts, sources.markers, sources.comms),
    [sources.plans, sources.emergencyContacts, sources.markers, sources.comms],
  );
  const binderSources: BinderSources = {
    plans: sources.plans,
    emergencyContacts: sources.emergencyContacts,
    comms: sources.comms,
    people: sources.people,
    opened: sources.opened,
    contacts: sources.contacts,
    grabPeople: sources.people.map((person) => grabPerson(person, sources.opened, sources.contacts)),
    household,
    entries: RADIO_FREQUENCIES,
    markers: sources.markers,
    supplies: sources.supplies,
    outlook: outlook.data?.outlook ?? null,
  };
  const lockedSheets = sources.people.filter((person) => person.sheet?.encrypted && !sources.opened.has(person.sheet.id)).length;
  const from = useMemo(() => ({ what: "the household binder", path: "/prepare/binder" }), []);
  const printed = usePaperPdf(binder?.pages ?? null, {
    title: `Household binder, ${formatDate((binder?.made ?? new Date(0)).getTime())}`,
    kind: "Household binder",
    from,
    created: binder?.made ?? EPOCH,
  });

  const toggle = (part: BinderPart, on: boolean) => {
    const next = BINDER_PARTS.map((each) => each.id).filter((id) => (id === part ? on : chosen.includes(id)));
    setChosen(next);
    writeStored(PARTS_KEY, next);
    setBinder(null);
  };

  const make = () => {
    if (!status.data) return;
    // Dated by the newest change among what goes in, so the same binder made twice is the same file.
    const times = chosen.map((part) => status.data.changedAt[part]).filter((at): at is number => at !== null);
    const contentAt = times.length > 0 ? Math.max(...times) : Date.now();
    const at = new Date(contentAt);
    try {
      const result = binderPages(chosen, binderSources, { paper, made: at, today: localDay(), style });
      if (result.parts.length === 0) {
        notify.error("None of the chosen parts has anything in it yet.");
        return;
      }
      setBinder({ ...result, made: at });
      made.mutate(
        { parts: result.parts, contentAt, pages: result.pages.length },
        { onError: (error) => notify.error(errorMessage(error)) },
      );
    } catch (error) {
      notify.error(errorMessage(error));
    }
  };

  return (
    <Page width="reading">
      <PageHeader
        title="Household binder"
        description="Everything that matters on paper, as one PDF with a contents page: plans, contacts, the communication plan, grab cards, medical sheets, frequencies, home and the meeting points, and supplies."
      />
      {sources.pending || status.isPending ? (
        <Skeleton className="h-64" />
      ) : sources.error || status.isError ? (
        <ErrorState
          error={sources.error ?? status.error}
          onRetry={() => {
            sources.retry();
            void status.refetch();
          }}
        />
      ) : (
        <div className="grid gap-6">
          {status.data.made ? (
            status.data.stale.length > 0 ? (
              <Notice tone="warning" icon={<TriangleAlert />} title="The binder last made is older than what is in it">
                Made on {formatDate(status.data.made.madeAt)}. Since then {partsWords(status.data.stale)} changed. Make it again and replace
                the printed copy.
              </Notice>
            ) : (
              <p className="text-small text-ink-muted">
                Last made on {formatDate(status.data.made.madeAt)}, {status.data.made.pages} pages, and nothing in it has changed since.
                Something deleted since is not noticed: make it again after taking anything out.
              </p>
            )
          ) : null}

          <Section title="What goes in it">
            <Rows>
              {BINDER_PARTS.map((part) => {
                const holds = partHolds(part.id, binderSources);
                return (
                  <li key={part.id} className="py-2">
                    <label htmlFor={`binder-${part.id}`} className="flex min-h-11 items-start gap-3">
                      <Checkbox
                        id={`binder-${part.id}`}
                        className="mt-1"
                        checked={chosen.includes(part.id)}
                        onCheckedChange={(on) => toggle(part.id, on === true)}
                      />
                      <span className="min-w-0">
                        <span className="block text-ink">{part.label}</span>
                        <span className="block text-small text-ink-muted">
                          {part.about} {holds ? `Now: ${holds}.` : "Nothing to put in yet."}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </Rows>
            {lockedSheets > 0 && chosen.includes("medical") ? (
              <p className="mt-3 text-small text-ink-muted">
                {lockedSheets === 1 ? "One medical sheet is" : `${lockedSheets} medical sheets are`} encrypted and not open on this device,
                so {lockedSheets === 1 ? "it is" : "they are"} left out. Open them under{" "}
                <Link to="/prepare/medical" className="text-primary underline underline-offset-2">
                  Medical sheets
                </Link>{" "}
                first to include them. In the binder they are in the clear.
              </p>
            ) : null}
          </Section>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={chosen.length === 0} loading={made.isPending} onClick={make}>
              <BookCopy /> Make the binder
            </Button>
            <Segmented<CardPaper>
              label="Paper"
              value={paper}
              onChange={(next) => {
                setPaper(next);
                writeStored(AID_PAPER_KEY, next);
                setBinder(null);
              }}
              options={(["a4", "letter"] as const).map((value) => ({ value, label: PAPERS[value].label }))}
            />
          </div>

          {binder ? (
            <div className="grid gap-4">
              <PdfActions
                pdf={pdfOf(printed)}
                lead="save"
                confirm={libraryQuestion(binder.parts.includes("medical") || binder.parts.includes("grab-cards"))}
              />
              <PaperPreview made={printed} />
            </div>
          ) : null}
        </div>
      )}
    </Page>
  );
}
