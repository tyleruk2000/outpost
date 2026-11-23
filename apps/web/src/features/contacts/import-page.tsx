/**
 * Bringing contacts in: from a vCard file, which every phone can make, or picked on
 * this phone where the browser allows it. Three steps, because it is a sequence: choose,
 * read what would happen, then do it. Nothing changes before the last button, and a
 * contact that looks like one already here is only touched if that is chosen for it.
 */
import type { ContactImportChoice, ContactImportDuplicate, ContactImportPreview, ContactImportResult } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileUp, Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { BackLink, Notice, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/misc";
import { Table, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { cn, formatNumber, plural } from "@/lib/utils";
import { applyImport, discardImport, pickerSupport, pickFromPhone, previewFile, previewPicked } from "./contacts-data";
import { ExportSteps } from "./phone-steps";

const REASONS: Record<ContactImportDuplicate["reason"], string> = {
  "same-card": "This is the same card as one already here, and it now says something different.",
  "name-and-number": "The same name as someone already here, with a number or an email address in common.",
  name: "The same name as someone already here and nothing else in common. This may be a different person.",
};

const CHOICES: Array<{ value: ContactImportChoice; label: string; detail: string }> = [
  { value: "keep", label: "Leave Outpost’s as it is", detail: "Nothing is brought in for this one." },
  { value: "merge", label: "Add what is new", detail: "Nothing Outpost has is removed or replaced." },
  {
    value: "replace",
    label: "Use the file’s",
    detail: "Names, numbers, addresses and the note become the file’s. The emergency mark, radio details, tags and links stay.",
  },
  { value: "both", label: "Keep both", detail: "The file’s comes in as a contact of its own." },
];

function Compare({
  duplicate,
  choice,
  onChoose,
}: {
  duplicate: ContactImportDuplicate;
  choice: ContactImportChoice;
  onChoose: (choice: ContactImportChoice) => void;
}) {
  const name = `choice-${duplicate.index}`;
  return (
    <li className="py-5">
      <h3 className="text-lead font-semibold text-ink">{duplicate.displayName}</h3>
      <p className="mt-0.5 max-w-[65ch] text-small text-ink-muted">{REASONS[duplicate.reason]}</p>

      <Table label={`${duplicate.displayName}: in Outpost and in the file`} className="mt-3 table-fixed">
        <TableHead>
          <Tr>
            <Th className="w-[22%] max-sm:w-[30%]">
              <span className="sr-only">Field</span>
            </Th>
            <Th>In Outpost</Th>
            <Th>In the file</Th>
          </Tr>
        </TableHead>
        <tbody>
          {duplicate.lines.map((line) => (
            <Tr key={line.label} className={cn(line.adds && "bg-primary-soft")}>
              <th
                scope="row"
                className={cn("py-2.5 pr-3 pl-1.5 text-left align-top font-medium", line.adds ? "text-primary-soft-ink" : "text-ink-muted")}
              >
                {line.label}
                {line.differs ? (
                  <span className="block text-micro font-normal">
                    {!line.adds ? "only in Outpost" : line.here.length === 0 ? "new in the file" : "differs"}
                  </span>
                ) : null}
              </th>
              {[line.here, line.incoming].map((side, at) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the two sides, in a fixed order
                <Td key={at} className="[overflow-wrap:anywhere] last:pr-1.5">
                  {side.length === 0 ? (
                    <span className="text-ink-muted">Nothing</span>
                  ) : (
                    side.map((value, row) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: values of one field, in order
                      <span key={row} className="block whitespace-pre-wrap">
                        {value}
                      </span>
                    ))
                  )}
                </Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </Table>

      <fieldset className="mt-3">
        <legend className="sr-only">What to do with {duplicate.displayName}</legend>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {CHOICES.map((option) => {
            const nothingToAdd = option.value === "merge" && duplicate.mergeAdds.length === 0;
            return (
              <label
                key={option.value}
                className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5", nothingToAdd && "cursor-default opacity-60")}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={choice === option.value}
                  disabled={nothingToAdd}
                  onChange={() => onChoose(option.value)}
                  className="mt-1 size-4 shrink-0 accent-(--primary)"
                />
                <span className="min-w-0">
                  <span className="block text-small font-medium text-ink">{option.label}</span>
                  <span className="block text-small text-ink-muted">
                    {option.value === "merge"
                      ? nothingToAdd
                        ? "The file has nothing Outpost lacks."
                        : `Adds ${duplicate.mergeAdds.join(", ")}. ${option.detail}`
                      : option.detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </li>
  );
}

function PreviewStep({
  preview,
  onDone,
  onCancel,
}: {
  preview: ContactImportPreview;
  onDone: (result: ContactImportResult) => void;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, ContactImportChoice>>({});
  const [leaveOut, setLeaveOut] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const client = useQueryClient();
  const apply = useMutation({
    mutationFn: () => applyImport({ token: preview.token, choices, leaveOut: [...leaveOut] }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["contacts"] });
      onDone(result);
    },
  });

  const choiceOf = (duplicate: ContactImportDuplicate) => choices[String(duplicate.index)] ?? "keep";
  const taken = Object.values(choices);
  const adding = preview.fresh.length - leaveOut.size + taken.filter((choice) => choice === "both").length;
  const changing = taken.filter((choice) => choice === "merge" || choice === "replace").length;
  const action =
    adding > 0 && changing > 0
      ? `Add ${plural(adding, "contact")} and change ${formatNumber(changing)}`
      : adding > 0
        ? `Add ${plural(adding, "contact")}`
        : changing > 0
          ? `Change ${plural(changing, "contact")}`
          : "Nothing to bring in";
  const shownFresh = showAll ? preview.fresh : preview.fresh.slice(0, 12);

  const facts = [
    preview.fresh.length > 0 ? `${plural(preview.fresh.length, "contact")} ${preview.fresh.length === 1 ? "is" : "are"} new.` : null,
    preview.alreadyHere > 0
      ? `${formatNumber(preview.alreadyHere)} ${preview.alreadyHere === 1 ? "is" : "are"} already here, with everything this has for ${preview.alreadyHere === 1 ? "it" : "them"}. Nothing to do.`
      : null,
    preview.duplicates.length > 0
      ? `${formatNumber(preview.duplicates.length)} ${preview.duplicates.length === 1 ? "looks" : "look"} like a contact already here. ${preview.duplicates.length === 1 ? "It is" : "They are"} shown below, and left alone unless you choose otherwise.`
      : null,
    preview.repeated > 0
      ? `${formatNumber(preview.repeated)} ${preview.repeated === 1 ? "is a card" : "are cards"} repeated in the file, and read once.`
      : null,
    preview.unreadable.length > 0
      ? `${formatNumber(preview.unreadable.length)} could not be read, and ${preview.unreadable.length === 1 ? "is" : "are"} listed at the end.`
      : null,
    preview.photosLeftOut > 0
      ? `${plural(preview.photosLeftOut, "picture")} in the file ${preview.photosLeftOut === 1 ? "was" : "were"} left out: Outpost keeps no photos of people.`
      : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <>
      <Section title={`What is in ${preview.fileName}`} description="Nothing has been changed yet.">
        <ul className="grid max-w-[70ch] gap-1 text-body text-ink">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
          {facts.length === 0 ? <li>There is nothing in it to bring in.</li> : null}
        </ul>
        {adding > preview.room ? (
          <Notice tone="warning" icon={<CircleAlert />} className="mt-4" title="Not all of these will fit">
            Outpost has room for {plural(preview.room, "more contact")}. The rest will be left out and counted.
          </Notice>
        ) : null}
      </Section>

      {preview.duplicates.length > 0 ? (
        <Section
          title="Look like someone already here"
          description="Each is shown beside Outpost’s own. Outpost’s is left as it is unless you choose something else for it."
          actions={
            preview.duplicates.length > 1 ? (
              <Select
                aria-label="Do the same for all of them"
                value={undefined}
                placeholder="Do the same for all"
                className="w-52"
                onChange={(choice: ContactImportChoice) =>
                  setChoices(
                    Object.fromEntries(
                      preview.duplicates.map((duplicate) => [
                        String(duplicate.index),
                        choice === "merge" && duplicate.mergeAdds.length === 0 ? "keep" : choice,
                      ]),
                    ),
                  )
                }
                options={CHOICES.map((option) => ({ value: option.value, label: option.label }))}
              />
            ) : undefined
          }
        >
          <ul className="divide-y divide-border border-y border-border">
            {preview.duplicates.map((duplicate) => (
              <Compare
                key={duplicate.index}
                duplicate={duplicate}
                choice={choiceOf(duplicate)}
                onChoose={(choice) => setChoices((current) => ({ ...current, [String(duplicate.index)]: choice }))}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {preview.fresh.length > 0 ? (
        <Section title="New" description="Untick anyone you do not want brought in.">
          <ul className="divide-y divide-border border-y border-border">
            {shownFresh.map((entry) => {
              const id = `fresh-${entry.index}`;
              return (
                <li key={entry.index}>
                  <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
                    <Checkbox
                      id={id}
                      checked={!leaveOut.has(entry.index)}
                      onCheckedChange={(on) =>
                        setLeaveOut((current) => {
                          const next = new Set(current);
                          if (on === true) next.delete(entry.index);
                          else next.add(entry.index);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{entry.displayName}</span>
                    <span className="tabular shrink-0 truncate text-small text-ink-muted max-sm:max-w-[40%]">{entry.detail}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {preview.fresh.length > shownFresh.length ? (
            <Button variant="link" className="mt-2" onClick={() => setShowAll(true)}>
              Show all {formatNumber(preview.fresh.length)}
            </Button>
          ) : null}
        </Section>
      ) : null}

      {preview.unreadable.length > 0 ? (
        <Section title="Could not be read" description="These were left out whole. Everything else in the file is unaffected.">
          <ul className="grid gap-1 text-small text-ink">
            {preview.unreadable.slice(0, 50).map((entry) => (
              <li key={entry.position}>
                <span className="tabular text-ink-muted">Card {formatNumber(entry.position)}:</span> {entry.reason}
              </li>
            ))}
            {preview.unreadable.length > 50 ? (
              <li className="text-ink-muted">And {formatNumber(preview.unreadable.length - 50)} more.</li>
            ) : null}
          </ul>
        </Section>
      ) : null}

      {apply.isError ? (
        <Notice tone="danger" title="Nothing was brought in" className="mt-6">
          {errorMessage(apply.error)}
        </Notice>
      ) : null}

      <div className="sticky bottom-0 z-(--z-sticky) mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-page py-3 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Button onClick={onCancel} disabled={apply.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => apply.mutate()} loading={apply.isPending} disabled={adding + changing === 0}>
          {action}
        </Button>
      </div>
    </>
  );
}

function DoneStep({ result, onAgain }: { result: ContactImportResult; onAgain: () => void }) {
  const lines = [
    result.added > 0 ? `Added ${plural(result.added, "contact")}.` : null,
    result.merged > 0 ? `Added what was new to ${plural(result.merged, "contact")} already here.` : null,
    result.replaced > 0 ? `Replaced ${plural(result.replaced, "contact")} with the file’s.` : null,
    result.kept > 0 ? `Left ${plural(result.kept, "contact")} as Outpost had ${result.kept === 1 ? "it" : "them"}.` : null,
    result.alreadyHere > 0 ? `${formatNumber(result.alreadyHere)} ${result.alreadyHere === 1 ? "was" : "were"} already here.` : null,
    result.leftOut > 0 ? `Left out ${formatNumber(result.leftOut)} that you unticked.` : null,
    result.overLimit > 0 ? `${formatNumber(result.overLimit)} did not fit: Outpost holds as many contacts as it will.` : null,
  ].filter((line): line is string => line !== null);
  return (
    <Notice tone="success" icon={<CircleCheck />} title="Done">
      <ul className="grid gap-0.5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {lines.length === 0 ? <li>Nothing was changed.</li> : null}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="primary">
          <Link to="/contacts">See the contacts</Link>
        </Button>
        <Button onClick={onAgain}>Bring in another file</Button>
      </div>
    </Notice>
  );
}

export default function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ContactImportPreview>();
  const [result, setResult] = useState<ContactImportResult>();
  const support = pickerSupport();
  const read = useMutation({
    mutationFn: async (source: File | "picker") => {
      if (source !== "picker") return previewFile(source);
      const picked = await pickFromPhone();
      return picked.length > 0 ? previewPicked(picked) : undefined;
    },
    onSuccess: (data) => setPreview(data),
  });

  const startOver = () => {
    if (preview && !result) void discardImport(preview.token).catch(() => undefined);
    setPreview(undefined);
    setResult(undefined);
    read.reset();
  };

  return (
    <Page width="reading">
      <BackLink to="/contacts" className="mb-2">
        Contacts
      </BackLink>
      <PageHeader
        title="Bring in contacts"
        description="From a vCard file, which every phone can make, or picked on this phone. Outpost reads them first and shows what it would do. Nothing changes until you say so."
      />

      {result ? (
        <DoneStep result={result} onAgain={startOver} />
      ) : preview ? (
        <PreviewStep preview={preview} onDone={setResult} onCancel={startOver} />
      ) : (
        <>
          <Section
            title="From a file"
            description="A .vcf file exported from a phone, a computer’s address book or another Outpost. Up to 50 MB."
          >
            <input
              ref={input}
              type="file"
              accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory"
              className="sr-only"
              aria-label="vCard file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) read.mutate(file);
              }}
            />
            <Button variant="primary" onClick={() => input.current?.click()} loading={read.isPending && read.variables !== "picker"}>
              <FileUp /> Choose a vCard file
            </Button>
          </Section>

          <Section title="Picked on this phone">
            {support === "available" ? (
              <>
                <p className="mb-3 max-w-[65ch] text-small text-ink-muted">
                  Your phone shows its own list and hands Outpost only the people you tick: their names, numbers, email addresses and
                  addresses.
                </p>
                <Button onClick={() => read.mutate("picker")} loading={read.isPending && read.variables === "picker"}>
                  <Smartphone /> Pick from this phone
                </Button>
              </>
            ) : support === "needs-https" ? (
              <p className="max-w-[65ch] text-small text-ink-muted">
                This browser can hand over contacts you pick, but only to an address that starts with https, and this one starts with http.
                Turn on{" "}
                <Link to="/settings#https" className="text-primary underline underline-offset-2">
                  HTTPS on your network
                </Link>{" "}
                in Settings, open Outpost at its https address, and the button appears here. Until then, use a file.
              </p>
            ) : (
              <p className="max-w-[65ch] text-small text-ink-muted">
                This browser cannot hand contacts to a web page. Today only Chrome on an Android phone can, and only at an https address;
                Safari on an iPhone cannot. Use a file instead: it carries more, too.
              </p>
            )}
          </Section>

          {read.isError ? (
            <Notice tone="danger" title="That could not be read" className="mt-6">
              {errorMessage(read.error)}
            </Notice>
          ) : null}

          <Section
            title="Making the file on a phone"
            description="The steps in Apple’s and Google’s own help pages as of November 2026. Menus move between versions."
          >
            <ExportSteps />
          </Section>
        </>
      )}
    </Page>
  );
}
