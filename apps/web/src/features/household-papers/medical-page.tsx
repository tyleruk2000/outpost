/**
 * Medical sheets: one for each person in the household (from Supplies), and for anyone
 * else the household looks after. Says plainly who can read them, since Outpost has no
 * accounts, and holds the two switches that let them into search and the model's tools.
 */
import { emptyMedicalRecord, localDay, type MedicalSheet, medicinesRunningLow } from "@outpost/shared";
import { ChevronRight, LockKeyhole, ShieldAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { useSupplies } from "@/features/emergency-plans/data";
import { KeepMedicalRow } from "@/features/kept/keep-controls";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useUpdateSettings } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { useMedicalSheets, useSaveSheet } from "./data";
import { useOpenedSheets } from "./medical-crypto";
import { medicineLeftWords, recordOf } from "./medical-words";

/** What the list says of one sheet, without opening it. */
export function sheetSummary(sheet: MedicalSheet | undefined, record: ReturnType<typeof recordOf>, today: string): string[] {
  if (!sheet) return ["No sheet yet"];
  if (!record) return ["Encrypted", "open it to read"];
  const low = medicinesRunningLow(record, today)[0];
  return [
    sheet.encrypted ? "Encrypted, open on this device" : "",
    plural(record.medicines.length, "medicine"),
    plural(record.allergies.length, "allergy", "allergies"),
    low ? `${low.line.name}: ${medicineLeftWords(low.line, today)}` : "",
  ].filter(Boolean);
}

export default function MedicalPage() {
  const sheets = useMedicalSheets();
  const supplies = useSupplies();
  const opened = useOpenedSheets();
  const save = useSaveSheet();
  const settings = useUpdateSettings();
  const navigate = useNavigate();
  const [other, setOther] = useState("");
  const today = localDay();

  const people = (supplies.data?.household.members ?? []).filter((member) => member.kind === "person");
  const list = sheets.data?.sheets ?? [];
  const byMember = new Map(list.filter((sheet) => sheet.memberId).map((sheet) => [sheet.memberId!, sheet]));
  const others = list.filter((sheet) => !sheet.memberId || !people.some((person) => person.id === sheet.memberId));

  const make = (memberId: string | null, name: string) =>
    save.mutate(
      { id: null, input: { memberId, name, record: emptyMedicalRecord() } },
      { onSuccess: (sheet) => navigate(`/prepare/medical/${sheet.id}`), onError: (error) => notify.error(errorMessage(error)) },
    );

  const row = (key: string, name: string, sheet: MedicalSheet | undefined, onMake: () => void, aside?: string) => (
    <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-lead text-ink">
          {sheet ? (
            <Link to={`/prepare/medical/${sheet.id}`} className="hover:text-primary">
              {name}
            </Link>
          ) : (
            name
          )}
          {sheet?.encrypted ? <LockKeyhole aria-label="Encrypted" className="ml-2 inline size-4 text-ink-muted" /> : null}
        </p>
        <p className="text-small text-ink-muted">
          <Joined parts={[...sheetSummary(sheet, sheet ? recordOf(sheet, opened) : null, today), aside ?? ""].filter(Boolean)} />
        </p>
      </div>
      {sheet ? (
        <Link to={`/prepare/medical/${sheet.id}`} className="inline-flex min-h-11 items-center gap-1 text-small text-primary md:min-h-8">
          Open <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <Button size="sm" onClick={onMake} loading={save.isPending}>
          Make a sheet
        </Button>
      )}
    </li>
  );

  const addOther = (event: FormEvent) => {
    event.preventDefault();
    if (other.trim()) make(null, other.trim());
  };

  return (
    <Page width="reading">
      <PageHeader
        title="Medical sheets"
        description="What a relative or a paramedic needs to be told about each person: medicines, allergies, conditions, blood group, the doctor and pharmacy, and next of kin. One sheet each, to print and for the grab card."
      />
      <Notice tone="warning" icon={<ShieldAlert />} title="The most private thing Outpost holds">
        Outpost has no accounts. Anyone who can reach it on your network can open a sheet that is not encrypted. Encrypt a sheet to need a
        passphrase or a key to read it; it is then opened only in the browser, on a device that has them. Outpost records what you type and
        gives no medical advice: it checks no dose, interaction or allergy.
      </Notice>

      {sheets.isPending || supplies.isPending ? (
        <Skeleton className="mt-8 h-48" />
      ) : sheets.isError ? (
        <div className="mt-8">
          <ErrorState error={sheets.error} onRetry={() => void sheets.refetch()} />
        </div>
      ) : (
        <>
          <Section title="People" className="mt-8">
            {people.length === 0 && others.length === 0 ? (
              <EmptyState
                compact
                level={3}
                title="No one in the household yet"
                action={
                  <Button asChild variant="primary">
                    <Link to="/prepare/supplies?view=household">Add the household</Link>
                  </Button>
                }
              >
                The household is kept under Supplies, so that food, water and these sheets count the same people. Or make a sheet for
                someone by name below.
              </EmptyState>
            ) : (
              <Rows>
                {people.map((person) =>
                  row(person.id, person.name || "A person with no name", byMember.get(person.id), () =>
                    make(person.id, person.name || "Unnamed"),
                  ),
                )}
                {others.map((sheet) =>
                  row(sheet.id, sheet.name, sheet, () => undefined, sheet.memberId ? "no longer in the household" : "not in the household"),
                )}
              </Rows>
            )}
            <KeepMedicalRow count={list.length} open={list.filter((sheet) => !sheet.encrypted).length} />
            <form onSubmit={addOther} className="mt-4 flex flex-wrap items-end gap-2">
              <Field
                label="Someone else"
                hint="A relative you look after, a lodger: anyone not counted in the household."
                className="min-w-[14rem] flex-1"
              >
                {(ids) => (
                  <Input
                    {...ids}
                    value={other}
                    maxLength={120}
                    onChange={(event) => setOther(event.target.value)}
                    placeholder="Their name"
                  />
                )}
              </Field>
              <Button type="submit" disabled={!other.trim()} loading={save.isPending}>
                Make a sheet
              </Button>
            </form>
          </Section>

          <Section title="Who else can read them" description="Both are off until you turn them on. Encrypted sheets are never included.">
            <Rows>
              <li className="flex items-start justify-between gap-4 py-3">
                <label htmlFor="medical-in-search" className="min-w-0">
                  <span className="block text-ink">Find them in search</span>
                  <span className="block text-small text-ink-muted">
                    Medicines, allergies and conditions of sheets that are not encrypted, in Search and the quick search, and in search by
                    meaning where it is set up (which sends their words to its model server).
                  </span>
                </label>
                <Switch
                  id="medical-in-search"
                  checked={sheets.data.inSearch}
                  disabled={settings.isPending}
                  onCheckedChange={(on) => settings.mutate({ "medical.inSearch": on }, { onSuccess: () => void sheets.refetch() })}
                />
              </li>
              <li className="py-3">
                <p className="text-ink">Let a language model read them</p>
                <p className="text-small text-ink-muted">
                  {sheets.data.inTools
                    ? "On: Chat, and other programs over MCP where that is turned on, can read the sheets that are not encrypted."
                    : "Off: neither Chat nor other programs over MCP can read them."}{" "}
                  <Link to="/settings#tools" className="text-primary underline underline-offset-2">
                    Change it under Settings, Looking things up
                  </Link>
                  .
                </p>
              </li>
            </Rows>
          </Section>
          {list.length > 0 ? (
            <p className="mt-6 text-small text-ink-muted">
              {plural(list.length, "sheet")} kept. Print them one at a time from each sheet, on the{" "}
              <Link to="/prepare/grab-cards" className="text-primary underline underline-offset-2">
                grab cards
              </Link>
              , or in the{" "}
              <Link to="/prepare/binder" className="text-primary underline underline-offset-2">
                household binder
              </Link>
              .
            </p>
          ) : null}
        </>
      )}
    </Page>
  );
}
