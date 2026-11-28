/**
 * A plan's printable emergency cards: a wallet card for each person, the fridge sheet,
 * and the grab list. Each is made as a PDF on this device, shown as it will print, and
 * offered with the three things every PDF made in Outpost has: save it, add it to the
 * library, share it. Adding it to the library asks first, because a card holds people's
 * names, numbers and where they will be.
 */
import { type EmergencyPlan, planKindLabel } from "@outpost/shared";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import { PdfPagesPreview } from "@/features/print-kit/preview";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { appLocale } from "@/lib/region";
import { plural } from "@/lib/utils";
import type { CardPaper } from "./cards";
import { usePlan } from "./data";
import { fridgeDocument, grabDocument, walletDocument } from "./kit-cards";
import { type Readable, readableOf } from "./printable";

type Kind = "wallet" | "fridge" | "grab";
const KINDS: Array<{ value: Kind; label: string; what: string }> = [
  { value: "wallet", label: "Wallet cards", what: "Wallet cards" },
  { value: "fridge", label: "Fridge sheet", what: "Fridge sheet" },
  { value: "grab", label: "Grab list", what: "Grab list" },
];
const shortDate = (date: Date) => new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" }).format(date);

/**
 * "Fridge sheet, Power cut, 16 Nov 2026", with the household's name after the plan's when
 * there are several: dated by when the plan was last changed, so the same plan makes the same file.
 */
export const cardTitle = (kind: Kind, plan: Pick<EmergencyPlan, "name" | "updatedAt">, household: string | null = null) =>
  `${KINDS.find((each) => each.value === kind)!.what}, ${plan.name}, ${household ? `${household}, ` : ""}${shortDate(new Date(plan.updatedAt))}`;

/** " (Storm)", or nothing when the name already says what kind of plan it is. */
const kindAside = (plan: EmergencyPlan) => {
  const kind = plan.kindText || planKindLabel(plan.kind);
  return plan.name.toLowerCase().includes(kind.toLowerCase()) ? "" : ` (${kind})`;
};

export function libraryQuestion(people: number) {
  return {
    title: "Put the household's details in the library?",
    description: (
      <>
        <span className="block">
          This holds names and phone numbers{people > 0 ? ` of ${plural(people, "person", "people")} and more` : ""}, and where your
          household will meet. In the library everyone who can reach Outpost on your network can read it and find it by search. It also goes
          into every backup.
        </span>
        <span className="mt-2 block">
          It is a copy: it does not change when the plan does, and it stays in the library until you delete it there.
        </span>
      </>
    ),
  };
}

/** The cards as a PDF, laid out with the print kit; names in other scripts are set in its fallback typefaces. */
export function CardsPdf({ plan, readable, kind, paper }: { plan: EmergencyPlan; readable: Readable; kind: Kind; paper: CardPaper }) {
  const at = plan.updatedAt;
  const laid = useMemo(() => {
    const made = new Date(at);
    if (kind === "wallet") {
      const { doc, cards } = walletDocument(readable, readable.people, { made, paper });
      return { doc, overflow: cards.filter((card) => card.overflow).map((card) => card.person.name || "a person with no name") };
    }
    return { doc: kind === "fridge" ? fridgeDocument(readable, { made, paper }) : grabDocument(readable, { made, paper }), overflow: [] };
  }, [readable, kind, paper, at]);
  const make = useCallback(() => laid.doc, [laid]);
  const made = useKitPdf(make, {
    title: cardTitle(kind, plan, readable.household),
    kind: KINDS.find((each) => each.value === kind)!.what,
    from: { what: `the emergency plan “${plan.name}”`, path: `/prepare/plans/${plan.id}/cards` },
  });
  const count = readable.people.length + readable.contacts.length;
  return (
    <div className="grid gap-4">
      {made.status === "failed" ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : (
        <PdfActions pdf={kitPdfOf(made)} confirm={libraryQuestion(count)} />
      )}
      {laid.overflow.length > 0 ? (
        <Notice tone="warning" title="Too much for a card">
          The card for {laid.overflow.join(", ")} does not fit, even in the smallest type: shorten the medical note or the names, or put
          fewer contacts first.
        </Notice>
      ) : null}
      {made.status === "made" ? (
        <div data-testid="cards-preview">
          <PdfPagesPreview bytes={made.bytes} pages={made.pages} label={(page, of) => `Page ${page} of ${of} as it prints`} />
        </div>
      ) : made.status === "making" ? (
        <Skeleton className="aspect-[1/1.41] w-full" />
      ) : null}
    </div>
  );
}

export default function CardsPage() {
  const { id = "" } = useParams();
  const response = usePlan(id);
  const [kind, setKind] = useState<Kind>("wallet");
  const [paper, setPaper] = useState<CardPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const readable = useMemo(
    () => (response.data ? readableOf(response.data.plan, response.data.resolved, undefined, response.data.household) : null),
    [response.data],
  );

  const about: Record<Kind, ReactNode> = {
    wallet: readable ? (
      readable.people.length === 0 ? (
        <>
          <Link to={`/prepare/plans/${id}#household`} className="text-primary underline underline-offset-2">
            Add the household's people to the plan
          </Link>{" "}
          to make a card for each.
        </>
      ) : (
        `A card for each of ${plural(readable.people.length, "person", "people")}: who they are, who to call, where to meet, the out-of-area contact, and anything medical they chose to put on it. Four to a sheet; each folds to the size of a bank card.`
      )
    ) : (
      ""
    ),
    fridge:
      "The steps for during and after, the numbers and the places to meet, on one page, as large as they will go. The steps for before stay in the plan.",
    grab: "What to take if leaving: the plan's supplies, with the amount for the household and a box to tick for each.",
  };

  return (
    <Page width="reading">
      <PageHeader
        back={{ to: `/prepare/plans/${id}`, label: "The whole plan" }}
        title="Cards to print"
        description={
          response.data
            ? `For “${response.data.plan.name}”${kindAside(response.data.plan)}. Each mark is told by its shape and words as well as its colour, so a grey copy reads the same. Print at actual size.`
            : undefined
        }
      />
      {response.isPending ? (
        <Skeleton className="h-64" />
      ) : response.isError || !readable || !response.data ? (
        <ErrorState error={response.error} onRetry={() => void response.refetch()} />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Kind>
              label="What to print"
              value={kind}
              onChange={setKind}
              options={KINDS.map(({ value, label }) => ({ value, label }))}
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
          <p className="max-w-[65ch] text-small text-ink-muted">
            {about[kind]} A printed copy does not change when the plan does: print it again after a number changes.
          </p>
          {kind === "wallet" && readable.people.length === 0 ? null : (
            <CardsPdf plan={response.data.plan} readable={readable} kind={kind} paper={paper} />
          )}
        </div>
      )}
    </Page>
  );
}
