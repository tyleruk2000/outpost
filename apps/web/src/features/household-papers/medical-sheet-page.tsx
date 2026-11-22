/**
 * One person's medical sheet, as the household writes it. Saved when "Save" is pressed:
 * an encrypted sheet is encrypted again in this browser at every save, and checked
 * before it is sent. From here it is printed, encrypted, locked or deleted.
 *
 * Outpost records what is typed. It gives no medical advice and checks nothing.
 */
import { BLOOD_GROUPS, type CareContact, localDay, MEDICAL_CAVEAT, type MedicalRecord, type MedicalSheet } from "@outpost/shared";
import { CircleAlert, LockKeyhole, LockKeyholeOpen, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { move, RowTools, removeAt, replaceAt } from "@/features/emergency-plans/list-edit";
import { ContactPicker } from "@/features/emergency-plans/people-section";
import { getEngine } from "@/features/encryption/engine";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { toSheets } from "@/features/propagation/plans/document";
import { errorMessage } from "@/lib/api";
import { appLocale } from "@/lib/region";
import { localId } from "@/lib/utils";
import { useContactsById, useMedicalSheets, useRemoveSheet, useSaveSheet } from "./data";
import { holdOpened, lockSheet, type OpenedSheet, sealSheet, touchOpened, useOpenedSheets } from "./medical-crypto";
import { EncryptSheetDialog, OpenSheet } from "./medical-lock";
import { type ContactsNow, contactIdsOf, medicalBlocks, medicineLeftWords, reach } from "./medical-words";
import { libraryQuestion, PaperPreview } from "./paper-pdf";
import { SAVE_BAR_ROOM, SaveBar } from "./save-bar";
import { pdfOf, usePaperPdf } from "./use-paper-pdf";

const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" });

const numberOrNull = (text: string): number | null => {
  const value = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) || value < 0 ? null : value;
};

/** A GP or pharmacy: from Contacts, or typed. */
function CareField({
  label,
  value,
  contacts,
  onChange,
}: {
  label: string;
  value: CareContact;
  contacts: ContactsNow;
  onChange(next: CareContact): void;
}) {
  const [picking, setPicking] = useState(false);
  const now = reach(value, contacts);
  return (
    <div className="grid gap-1.5">
      <span className="text-small font-medium text-ink">{label}</span>
      {value.contactId || value.name ? (
        <p className="text-small text-ink">
          {value.contactId ? (
            <Link to={`/contacts/${value.contactId}`} className="text-primary underline underline-offset-2">
              {now.name || value.name}
            </Link>
          ) : (
            now.name
          )}
          {now.phone ? <span className="tabular">, {now.phone}</span> : null}
          {now.missing ? <span className="text-warning">: no longer in Contacts</span> : null}
        </p>
      ) : (
        <p className="text-small text-ink-muted">Not given.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setPicking(true)}>
          {value.contactId || value.name ? "Change" : "Choose"}
        </Button>
        {value.contactId || value.name ? (
          <Button size="sm" variant="ghost" onClick={() => onChange({ contactId: null, name: "", phone: "" })}>
            Clear
          </Button>
        ) : null}
      </div>
      <ContactPicker
        open={picking}
        onOpenChange={setPicking}
        title={`Choose the ${label.toLowerCase()}`}
        onPick={(picked) => onChange({ contactId: picked.contactId, name: picked.name, phone: picked.phone })}
      />
    </div>
  );
}

function Editor({ sheet, record: start, opened }: { sheet: MedicalSheet; record: MedicalRecord; opened: OpenedSheet | null }) {
  const save = useSaveSheet();
  const remove = useRemoveSheet();
  const navigate = useNavigate();
  const [name, setName] = useState(sheet.name);
  const [record, setRecord] = useState(start);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [encrypting, setEncrypting] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickingKin, setPickingKin] = useState(false);
  const today = localDay();
  const contacts = useContactsById(contactIdsOf(record));

  const change = (next: Partial<MedicalRecord>) => {
    setRecord((current) => ({ ...current, ...next }));
    setDirty(true);
    if (opened) touchOpened(sheet.id);
  };

  const send = async (plain: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (sheet.encrypted && opened && !plain) {
        const armor = await sealSheet(await getEngine(), name.trim(), record, opened.lock);
        // Held with the message about to be saved, so that the sheet stays open when the saved version arrives.
        holdOpened(sheet.id, { armor, record, lock: opened.lock });
        try {
          await save.mutateAsync({
            id: sheet.id,
            input: { memberId: sheet.memberId, name: name.trim(), armor, baseUpdatedAt: sheet.updatedAt },
          });
        } catch (failure) {
          holdOpened(sheet.id, opened);
          throw failure;
        }
      } else {
        await save.mutateAsync({
          id: sheet.id,
          input: {
            memberId: sheet.memberId,
            name: name.trim(),
            record,
            baseUpdatedAt: sheet.updatedAt,
            removeEncryption: plain || undefined,
          },
        });
        if (plain) lockSheet(sheet.id);
      }
      setDirty(false);
      toast(plain ? "The sheet is no longer encrypted." : "Sheet saved.");
    } catch (failure) {
      setError(`${errorMessage(failure)} Nothing was saved.`);
    } finally {
      setBusy(false);
    }
  };

  const pages = useMemo(
    () => toSheets(medicalBlocks(sheet.name, start, contacts, today), `Medical sheet: ${sheet.name} · Outpost`),
    [sheet.name, start, contacts, today],
  );
  const from = useMemo(
    () => ({ what: `the medical sheet of ${sheet.name}`, path: `/prepare/medical/${sheet.id}` }),
    [sheet.name, sheet.id],
  );
  const created = useMemo(() => new Date(sheet.updatedAt), [sheet.updatedAt]);
  const printed = usePaperPdf(pages, {
    title: `Medical sheet, ${sheet.name}, ${shortDate.format(sheet.updatedAt)}`,
    kind: "Medical sheet",
    from,
    created,
  });

  return (
    <div className="grid gap-2">
      <p className="text-small text-ink-muted">{MEDICAL_CAVEAT}</p>

      <Section title="Who" className="mt-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            {(ids) => (
              <Input
                {...ids}
                value={name}
                maxLength={120}
                onChange={(event) => {
                  setName(event.target.value);
                  setDirty(true);
                }}
              />
            )}
          </Field>
          <Field label="Born" optional>
            {(ids) => (
              <Input
                {...ids}
                value={record.born}
                maxLength={120}
                placeholder="9 March 1984"
                onChange={(event) => change({ born: event.target.value })}
              />
            )}
          </Field>
          <Field label="Blood group" optional hint="Leave empty when it is not known.">
            {(ids) => (
              <>
                <Input
                  {...ids}
                  list="blood-groups"
                  value={record.bloodGroup}
                  maxLength={20}
                  onChange={(event) => change({ bloodGroup: event.target.value })}
                />
                <datalist id="blood-groups">
                  {BLOOD_GROUPS.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
      </Section>

      <Section title="Allergies" description="What to, and what happens.">
        <ul className="grid gap-3">
          {record.allergies.map((line, index) => (
            <li key={line.id} className="flex flex-wrap items-end gap-2">
              <Field label="Allergy to" className="min-w-[10rem] flex-1">
                {(ids) => (
                  <Input
                    {...ids}
                    value={line.what}
                    maxLength={120}
                    onChange={(event) => change({ allergies: replaceAt(record.allergies, index, { ...line, what: event.target.value }) })}
                  />
                )}
              </Field>
              <Field label="What happens" optional className="min-w-[12rem] flex-[2]">
                {(ids) => (
                  <Input
                    {...ids}
                    value={line.reaction}
                    maxLength={600}
                    onChange={(event) =>
                      change({ allergies: replaceAt(record.allergies, index, { ...line, reaction: event.target.value }) })
                    }
                  />
                )}
              </Field>
              <RowTools
                name={line.what || "allergy"}
                first={index === 0}
                last={index === record.allergies.length - 1}
                onMove={(by) => change({ allergies: move(record.allergies, index, by) })}
                onRemove={() => change({ allergies: removeAt(record.allergies, index) })}
              />
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => change({ allergies: [...record.allergies, { id: localId(), what: "", reaction: "" }] })}
        >
          <Plus /> Add an allergy
        </Button>
      </Section>

      <Section
        title="Medicines"
        description="Count what is held to see how long it lasts. A medicine taken only when needed has no daily use."
      >
        <ul className="grid gap-5">
          {record.medicines.map((line, index) => {
            const set = (patch: Partial<typeof line>) => change({ medicines: replaceAt(record.medicines, index, { ...line, ...patch }) });
            const left = medicineLeftWords(line, today);
            return (
              <li key={line.id} className="grid gap-3 border-b border-border pb-5 last:border-b-0">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Medicine" className="min-w-[10rem] flex-1">
                    {(ids) => <Input {...ids} value={line.name} maxLength={120} onChange={(event) => set({ name: event.target.value })} />}
                  </Field>
                  <Field label="Dose" optional className="min-w-[8rem] flex-1">
                    {(ids) => (
                      <Input
                        {...ids}
                        value={line.dose}
                        maxLength={120}
                        placeholder="As the label says"
                        onChange={(event) => set({ dose: event.target.value })}
                      />
                    )}
                  </Field>
                  <RowTools
                    name={line.name || "medicine"}
                    first={index === 0}
                    last={index === record.medicines.length - 1}
                    onMove={(by) => change({ medicines: move(record.medicines, index, by) })}
                    onRemove={() => change({ medicines: removeAt(record.medicines, index) })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="When" optional>
                    {(ids) => (
                      <Input
                        {...ids}
                        value={line.when}
                        maxLength={120}
                        placeholder="Morning and night"
                        onChange={(event) => set({ when: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Kept where" optional>
                    {(ids) => (
                      <Input
                        {...ids}
                        value={line.keptWhere}
                        maxLength={120}
                        placeholder="Kitchen cupboard, top shelf"
                        onChange={(event) => set({ keptWhere: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Held" optional className="w-28">
                    {(ids) => (
                      <Input
                        {...ids}
                        inputMode="decimal"
                        className="tabular"
                        value={line.held ?? ""}
                        onChange={(event) => set({ held: numberOrNull(event.target.value) })}
                      />
                    )}
                  </Field>
                  <Field label="Unit" optional className="w-32">
                    {(ids) => (
                      <Input
                        {...ids}
                        value={line.unit}
                        maxLength={40}
                        placeholder="tablets"
                        onChange={(event) => set({ unit: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Used a day" optional className="w-28">
                    {(ids) => (
                      <Input
                        {...ids}
                        inputMode="decimal"
                        className="tabular"
                        value={line.perDay ?? ""}
                        onChange={(event) => set({ perDay: numberOrNull(event.target.value) })}
                      />
                    )}
                  </Field>
                  <Field label="Counted on" optional className="w-44">
                    {(ids) => (
                      <Input
                        {...ids}
                        type="date"
                        value={line.countedOn ?? ""}
                        onChange={(event) => set({ countedOn: event.target.value || null })}
                      />
                    )}
                  </Field>
                  <Button size="sm" onClick={() => set({ countedOn: today })}>
                    Counted today
                  </Button>
                </div>
                <p className="text-small text-ink-muted">
                  {left ? `By the count: ${left}.` : "Not counted down: give what is held, a day's use and the day it was counted."}
                </p>
              </li>
            );
          })}
        </ul>
        <Button
          size="sm"
          className="mt-3"
          onClick={() =>
            change({
              medicines: [
                ...record.medicines,
                { id: localId(), name: "", dose: "", when: "", keptWhere: "", held: null, unit: "", perDay: null, countedOn: null },
              ],
            })
          }
        >
          <Plus /> Add a medicine
        </Button>
      </Section>

      <Section title="Conditions">
        <ul className="grid gap-3">
          {record.conditions.map((line, index) => (
            <li key={line.id} className="flex flex-wrap items-end gap-2">
              <Field label="Condition" className="min-w-[10rem] flex-1">
                {(ids) => (
                  <Input
                    {...ids}
                    value={line.what}
                    maxLength={120}
                    onChange={(event) => change({ conditions: replaceAt(record.conditions, index, { ...line, what: event.target.value }) })}
                  />
                )}
              </Field>
              <Field label="What to know" optional className="min-w-[12rem] flex-[2]">
                {(ids) => (
                  <Input
                    {...ids}
                    value={line.note}
                    maxLength={600}
                    onChange={(event) => change({ conditions: replaceAt(record.conditions, index, { ...line, note: event.target.value }) })}
                  />
                )}
              </Field>
              <RowTools
                name={line.what || "condition"}
                first={index === 0}
                last={index === record.conditions.length - 1}
                onMove={(by) => change({ conditions: move(record.conditions, index, by) })}
                onRemove={() => change({ conditions: removeAt(record.conditions, index) })}
              />
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => change({ conditions: [...record.conditions, { id: localId(), what: "", note: "" }] })}
        >
          <Plus /> Add a condition
        </Button>
      </Section>

      <Section title="Who to tell" description="From Contacts, so that a changed number is changed here too, or typed.">
        <div className="grid gap-5 sm:grid-cols-2">
          <CareField label="Doctor or GP surgery" value={record.gp} contacts={contacts} onChange={(gp) => change({ gp })} />
          <CareField label="Pharmacy" value={record.pharmacy} contacts={contacts} onChange={(pharmacy) => change({ pharmacy })} />
        </div>
        <h3 className="mt-6 text-small font-medium text-ink">Next of kin</h3>
        <ul className="mt-2 grid gap-3">
          {record.nextOfKin.map((kin, index) => {
            const now = reach(kin, contacts);
            return (
              <li key={kin.id} className="flex flex-wrap items-end gap-2">
                <p className="min-w-[10rem] flex-1 text-small text-ink">
                  {now.name}
                  {now.phone ? <span className="tabular">, {now.phone}</span> : null}
                  {now.missing ? <span className="text-warning">: no longer in Contacts</span> : null}
                </p>
                <Field label="Who they are" optional className="min-w-[10rem] flex-1">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={kin.relation}
                      maxLength={120}
                      placeholder="Mother"
                      onChange={(event) =>
                        change({ nextOfKin: replaceAt(record.nextOfKin, index, { ...kin, relation: event.target.value }) })
                      }
                    />
                  )}
                </Field>
                <RowTools
                  name={now.name || "next of kin"}
                  first={index === 0}
                  last={index === record.nextOfKin.length - 1}
                  onMove={(by) => change({ nextOfKin: move(record.nextOfKin, index, by) })}
                  onRemove={() => change({ nextOfKin: removeAt(record.nextOfKin, index) })}
                />
              </li>
            );
          })}
        </ul>
        <Button size="sm" className="mt-3" onClick={() => setPickingKin(true)}>
          <Plus /> Add next of kin
        </Button>
        <ContactPicker
          open={pickingKin}
          onOpenChange={setPickingKin}
          title="Add next of kin"
          onPick={(picked) =>
            change({
              nextOfKin: [
                ...record.nextOfKin,
                { id: localId(), contactId: picked.contactId, name: picked.name, phone: picked.phone, relation: "" },
              ],
            })
          }
        />
      </Section>

      <Section title="Notes">
        <Field label="Anything else to know" optional>
          {(ids) => (
            <Textarea
              {...ids}
              rows={4}
              value={record.notes}
              maxLength={4000}
              placeholder="Wears a hearing aid. Health card in the blue folder."
              onChange={(event) => change({ notes: event.target.value })}
            />
          )}
        </Field>
      </Section>

      <SaveBar>
        <Button variant="primary" loading={busy} disabled={!dirty || !name.trim()} onClick={() => void send(false)}>
          Save
        </Button>
        <span className="text-small text-ink-muted" role="status">
          {dirty ? "Changes not saved yet." : `Saved ${shortDate.format(sheet.updatedAt)}.`}
          {sheet.encrypted ? " Encrypted again in this browser at every save." : ""}
        </span>
      </SaveBar>
      {error ? (
        <Notice tone="danger" icon={<CircleAlert />}>
          {error}
        </Notice>
      ) : null}

      <Section title="Encryption">
        {sheet.encrypted ? (
          <div className="grid gap-3">
            <p className="text-small text-ink-muted">
              Encrypted. It is open in this tab until you lock it or leave it for five minutes. Outpost holds only the name and the
              encrypted message.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => lockSheet(sheet.id)}>
                <LockKeyhole /> Lock
              </Button>
              <Button variant="ghost" onClick={() => setDecrypting(true)}>
                <LockKeyholeOpen /> Take the encryption off
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-small text-ink-muted">Not encrypted: anyone who can reach Outpost on your network can read it.</p>
            <Button className="justify-self-start" disabled={dirty} onClick={() => setEncrypting(true)}>
              <LockKeyhole /> Encrypt this sheet
            </Button>
            {dirty ? <p className="text-small text-ink-muted">Save your changes first.</p> : null}
          </div>
        )}
      </Section>

      <Section
        title="Print"
        description="As saved. Black on white, so a grey copy reads the same. A printed copy does not change when the sheet does."
      >
        <div className="grid gap-4">
          <PdfActions pdf={pdfOf(printed)} lead="save" confirm={libraryQuestion(true)} />
          <PaperPreview made={printed} />
        </div>
      </Section>

      <Section title="Delete">
        <Button variant="danger-ghost" className="justify-self-start" onClick={() => setDeleting(true)}>
          <Trash2 /> Delete this sheet
        </Button>
      </Section>

      {encrypting ? <EncryptSheetDialog sheet={sheet} name={name.trim()} record={record} onClose={() => setEncrypting(false)} /> : null}
      <ConfirmDialog
        open={decrypting}
        onOpenChange={setDecrypting}
        title="Take the encryption off?"
        description="The sheet will be saved in the clear: anyone who can reach Outpost on your network can then read it, and the switches for search and language models apply to it."
        confirmLabel="Save it unencrypted"
        confirmVariant="primary"
        loading={busy}
        onConfirm={() => {
          setDecrypting(false);
          void send(true);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${sheet.name}’s medical sheet?`}
        description="The sheet goes from Outpost. Printed copies, PDFs and backups made before keep what they hold."
        confirmLabel="Delete sheet"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(sheet.id, {
            onSuccess: () => {
              lockSheet(sheet.id);
              navigate("/prepare/medical");
            },
          })
        }
      />
    </div>
  );
}

export default function MedicalSheetPage() {
  const { id = "" } = useParams();
  const sheets = useMedicalSheets();
  const opened = useOpenedSheets();
  const sheet = sheets.data?.sheets.find((entry) => entry.id === id);
  const held = sheet ? opened.get(sheet.id) : undefined;
  // A sheet saved elsewhere since it was opened here is a different message: it has to be opened again.
  const open = held && sheet && held.armor === sheet.armor ? held : null;
  const record = sheet ? (sheet.encrypted ? (open?.record ?? null) : sheet.record) : null;

  return (
    <Page width="reading" className={SAVE_BAR_ROOM}>
      <PageHeader
        back={{ to: "/prepare/medical", label: "Medical sheets" }}
        title={sheet ? `Medical sheet: ${sheet.name}` : "Medical sheet"}
      />
      {sheets.isPending ? (
        <Skeleton className="h-64" />
      ) : sheets.isError ? (
        <ErrorState error={sheets.error} onRetry={() => void sheets.refetch()} />
      ) : !sheet ? (
        <EmptyState
          title="This sheet is no longer in Outpost"
          action={
            <Button asChild>
              <Link to="/prepare/medical">Back to the medical sheets</Link>
            </Button>
          }
        >
          It may have been deleted on another device.
        </EmptyState>
      ) : !record ? (
        <OpenSheet sheet={sheet} />
      ) : (
        // Keyed by version: a sheet saved elsewhere starts the editor again from what was saved.
        <Editor key={`${sheet.id}:${sheet.updatedAt}`} sheet={sheet} record={record} opened={open} />
      )}
    </Page>
  );
}
