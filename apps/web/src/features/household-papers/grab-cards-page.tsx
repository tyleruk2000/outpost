/**
 * Grab cards: one for each person, wallet size or A6, made from their medical sheet,
 * the household's emergency contacts, the meeting points of every plan, the first steps
 * of the communication plan, and where home is in the grid formats chosen. Nothing is
 * typed here: the card is what Outpost holds now, so it is up to date whenever it is
 * made again.
 */
import { GRID_FORMATS, type GridFormat, NO_HOME_PLACE } from "@outpost/shared";
import { LockKeyhole } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented, Skeleton } from "@/components/ui/misc";
import type { CardPaper } from "@/features/emergency-plans/cards";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { appLocale } from "@/lib/region";
import type { GrabCardSize } from "./grab-cards";
import { grabHousehold, grabPerson, useHouseholdSources } from "./household-data";
import { grabCardsDocument, grabOverflow } from "./kit-papers";
import { libraryQuestion, PaperPreview } from "./paper-pdf";

const FORMATS_KEY = "outpost.grabCards.formats";
const SIZE_KEY = "outpost.grabCards.size";
const isFormats = (value: unknown): value is GridFormat[] =>
  Array.isArray(value) && value.every((item) => GRID_FORMATS.some((format) => format.id === item));
const isSize = (value: unknown): value is GrabCardSize => value === "wallet" || value === "a6";
const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" });

export default function GrabCardsPage() {
  const sources = useHouseholdSources();
  const [size, setSize] = useState<GrabCardSize>(() => readStored(SIZE_KEY, isSize, "wallet"));
  const [paper, setPaper] = useState<CardPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const [formats, setFormats] = useState<GridFormat[]>(() => readStored(FORMATS_KEY, isFormats, ["decimal", "osgb", "maidenhead"]));

  const household = useMemo(
    () => grabHousehold(sources.plans, sources.emergencyContacts, sources.markers, sources.comms),
    [sources.plans, sources.emergencyContacts, sources.markers, sources.comms],
  );
  const cardPeople = useMemo(
    () => sources.people.map((person) => grabPerson(person, sources.opened, sources.contacts)),
    [sources.people, sources.opened, sources.contacts],
  );
  // Dated by the newest thing on the cards, so the same cards made twice are the same file.
  const contentAt = Math.max(
    0,
    ...sources.people.map((person) => person.sheet?.updatedAt ?? 0),
    ...sources.plans.map((data) => data.plan.updatedAt),
    sources.comms?.plan.updatedAt ?? 0,
    ...sources.emergencyContacts.map((contact) => contact.updatedAt),
  );
  const made = useMemo(() => new Date(contentAt || Date.now()), [contentAt]);
  const make = useCallback(
    () => grabCardsDocument(cardPeople, household, { size, formats, made, paper }),
    [cardPeople, household, size, formats, made, paper],
  );
  const from = useMemo(() => ({ what: "the household's grab cards", path: "/prepare/grab-cards" }), []);
  const printed = useKitPdf(make, {
    title: `Grab cards, ${size === "wallet" ? "wallet size" : "A6"}, ${shortDate.format(made)}`,
    kind: "Grab cards",
    from,
  });
  const locked = sources.people.filter(
    (person) => person.sheet?.encrypted && cardPeople.find((card) => card.name === person.name)?.sheetLocked,
  );
  const overflow = useMemo(
    () => grabOverflow(cardPeople, household, { size, formats, made }),
    [cardPeople, household, size, formats, made],
  );

  const toggle = (format: GridFormat, on: boolean) => {
    const next = GRID_FORMATS.map((each) => each.id).filter((id) => (id === format ? on : formats.includes(id)));
    setFormats(next);
    writeStored(FORMATS_KEY, next);
  };

  return (
    <Page width="reading">
      <PageHeader
        title="Grab cards"
        description="A card for each person to carry: their medical needs, who to contact, where the household meets, how to keep in touch, and where home is. Made from what Outpost holds now."
      />
      {sources.pending ? (
        <Skeleton className="h-64" />
      ) : sources.error ? (
        <ErrorState error={sources.error} onRetry={sources.retry} />
      ) : sources.people.length === 0 ? (
        <EmptyState
          title="No one to make a card for yet"
          action={
            <Button asChild variant="primary">
              <Link to="/prepare/supplies?view=household">Add the household</Link>
            </Button>
          }
        >
          The household is kept under Supplies. Each person in it gets a card, and so does anyone else with a medical sheet.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<GrabCardSize>
              label="Size"
              value={size}
              onChange={(next) => {
                setSize(next);
                writeStored(SIZE_KEY, next);
              }}
              options={[
                { value: "wallet", label: "Wallet" },
                { value: "a6", label: "A6" },
              ]}
            />
            <Segmented<CardPaper>
              label="Paper"
              value={paper}
              onChange={(next) => {
                setPaper(next);
                writeStored(AID_PAPER_KEY, next);
              }}
              options={(["a4", "letter"] as const).map((value) => ({ value, label: PAPERS[value].label }))}
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-small font-medium text-ink">Where home is, as</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {GRID_FORMATS.map((format) => (
                <label
                  key={format.id}
                  htmlFor={`grid-${format.id}`}
                  className="flex min-h-11 items-center gap-2 text-small text-ink md:min-h-8"
                >
                  <Checkbox
                    id={`grid-${format.id}`}
                    checked={formats.includes(format.id)}
                    onCheckedChange={(on) => toggle(format.id, on === true)}
                  />
                  {format.label}
                </label>
              ))}
            </div>
            {household.home ? (
              <p className="text-small text-ink-muted">British National Grid is left off a card when home is outside Great Britain.</p>
            ) : (
              <p className="text-small text-ink-muted">
                {NO_HOME_PLACE}{" "}
                <Link to="/maps" className="text-primary underline underline-offset-2">
                  Open Maps
                </Link>
              </p>
            )}
          </fieldset>
          <p className="max-w-[65ch] text-small text-ink-muted">
            Medical lines come from each person’s{" "}
            <Link to="/prepare/medical" className="text-primary underline underline-offset-2">
              medical sheet
            </Link>
            , meeting points from the{" "}
            <Link to="/prepare/plans" className="text-primary underline underline-offset-2">
              emergency plans
            </Link>
            , and the first steps from{" "}
            <Link to="/prepare/keeping-in-touch" className="text-primary underline underline-offset-2">
              Keeping in touch
            </Link>
            . A printed card does not change when they do: make it again after a change.
          </p>
          {locked.length > 0 ? (
            <Notice tone="info" icon={<LockKeyhole />} title="Encrypted sheets are not on the cards">
              {locked.map((person) => person.name).join(", ")}: open the sheet on this device and come back here to put it on the card.
            </Notice>
          ) : null}
          <PdfActions pdf={kitPdfOf(printed)} lead="save" confirm={libraryQuestion(true)} />
          <PaperPreview made={printed}>
            {overflow.length > 0 ? (
              <Notice tone="warning" title="Too much for a card">
                The card for {overflow.join(", ")} does not fit, even in the smallest type. Try A6, fewer grid formats, or shorter lines on
                the medical sheet.
              </Notice>
            ) : null}
          </PaperPreview>
        </div>
      )}
    </Page>
  );
}
