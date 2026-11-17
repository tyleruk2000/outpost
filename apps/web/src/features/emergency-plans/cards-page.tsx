/**
 * A plan's printable emergency cards: a wallet card for each person, the fridge sheet,
 * and the grab list. Each is made as a PDF on this device, shown as it will print, and
 * offered with the three things every PDF made in Outpost has: save it, add it to the
 * library, share it. Adding it to the library asks first, because a card holds people's
 * names, numbers and where they will be.
 */
import { type EmergencyPlan, planKindLabel } from "@outpost/shared";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { type DrawLine, writeLettered } from "@/features/maps/print/lettering";
import { PAPERS } from "@/features/maps/print/paper";
import type { Sheet } from "@/features/maps/print/sheet";
import { SheetView } from "@/features/maps/print/sheet-view";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { type CardPaper, fridgeSheets, grabSheets, walletSheets } from "./cards";
import { usePlan } from "./data";
import { type Readable, readableOf } from "./printable";

type Kind = "wallet" | "fridge" | "grab";
const KINDS: Array<{ value: Kind; label: string; what: string }> = [
  { value: "wallet", label: "Wallet cards", what: "Wallet cards" },
  { value: "fridge", label: "Fridge sheet", what: "Fridge sheet" },
  { value: "grab", label: "Grab list", what: "Grab list" },
];
const shortDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);

/** "Fridge sheet, Power cut, 16 Nov 2026": dated by when the plan was last changed, so the same plan makes the same file. */
export const cardTitle = (kind: Kind, plan: Pick<EmergencyPlan, "name" | "updatedAt">) =>
  `${KINDS.find((each) => each.value === kind)!.what}, ${plan.name}, ${shortDate(new Date(plan.updatedAt))}`;

/** " (Storm)", or nothing when the name already says what kind of plan it is. */
const kindAside = (plan: EmergencyPlan) => {
  const kind = plan.kindText || planKindLabel(plan.kind);
  return plan.name.toLowerCase().includes(kind.toLowerCase()) ? "" : ` (${kind})`;
};

export function sheetsOf(kind: Kind, readable: Readable, made: Date, paper: CardPaper): { pages: Sheet[]; overflow: string[] } {
  if (kind === "wallet") {
    const { pages, cards } = walletSheets(readable, readable.people, { made, paper });
    return { pages, overflow: cards.filter((card) => card.overflow).map((card) => card.person.name || "a person with no name") };
  }
  return { pages: kind === "fridge" ? fridgeSheets(readable, { made, paper }) : grabSheets(readable, { made, paper }), overflow: [] };
}

type Made = { pdf: MadePdf; pages: Sheet[]; drawn: number; marked: number; overflow: string[] } | { error: string };

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

export function CardsPdf({
  plan,
  readable,
  kind,
  paper,
  draw,
}: {
  plan: EmergencyPlan;
  readable: Readable;
  kind: Kind;
  paper: CardPaper;
  draw?: DrawLine;
}) {
  const [made, setMade] = useState<Made | null>(null);
  useEffect(() => {
    let live = true;
    setMade(null);
    const at = new Date(plan.updatedAt);
    const title = cardTitle(kind, plan);
    const { pages, overflow } = sheetsOf(kind, readable, at, paper);
    writeLettered(pages, title, at, draw)
      .then((written) => ({
        pdf: madePdf(written.bytes, title, KINDS.find((each) => each.value === kind)!.what, {
          what: `the emergency plan “${plan.name}”`,
          path: `/prepare/plans/${plan.id}/cards`,
        }),
        pages,
        drawn: written.drawn,
        marked: written.marked,
        overflow,
      }))
      .catch((error: unknown) => ({ error: errorMessage(error) }))
      .then((result) => {
        if (live) setMade(result);
      });
    return () => {
      live = false;
    };
  }, [plan, readable, kind, paper, draw]);

  const count = readable.people.length + readable.contacts.length;
  return (
    <div className="grid gap-4">
      {made && "error" in made ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : (
        <PdfActions pdf={made && "pdf" in made ? made.pdf : null} confirm={libraryQuestion(count)} />
      )}
      {made && "pdf" in made && made.overflow.length > 0 ? (
        <Notice tone="warning" title="Too much for a card">
          The card for {made.overflow.join(", ")} does not fit, even in the smallest type: shorten the medical note or the names, or put
          fewer contacts first.
        </Notice>
      ) : null}
      {made && "pdf" in made && made.marked > 0 ? (
        <p className="text-small text-ink">
          This device could not put some letters on the page, so each place they belong is marked [?]. The plan on screen has them in full.
        </p>
      ) : made && "pdf" in made && made.drawn > 0 ? (
        <p className="text-small text-ink-muted">
          Names in letters the PDF's own typefaces do not have are drawn as pictures, with the words kept in the file so that search finds
          them.
        </p>
      ) : null}
      {made && "pdf" in made ? (
        <div className="grid gap-4" data-testid="cards-preview">
          {made.pages.map((page, index) => (
            <SheetView
              // biome-ignore lint/suspicious/noArrayIndexKey: pages are in order
              key={index}
              sheet={page}
              pictures={{}}
              label={`Page ${index + 1} of ${made.pages.length} as it prints`}
              className="h-auto w-full rounded-panel border border-border-strong"
            />
          ))}
        </div>
      ) : made ? null : (
        <Skeleton className="aspect-[1/1.41] w-full" />
      )}
    </div>
  );
}

export default function CardsPage() {
  const { id = "" } = useParams();
  const response = usePlan(id);
  const [kind, setKind] = useState<Kind>("wallet");
  const [paper, setPaper] = useState<CardPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const readable = useMemo(() => (response.data ? readableOf(response.data.plan, response.data.resolved) : null), [response.data]);

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
      <Link to={`/prepare/plans/${id}`} className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-small text-primary">
        <ArrowLeft aria-hidden className="size-4" /> The whole plan
      </Link>
      <PageHeader
        title="Cards to print"
        description={
          response.data
            ? `For “${response.data.plan.name}”${kindAside(response.data.plan)}. Black on white, so a grey copy reads the same. Print at actual size.`
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
