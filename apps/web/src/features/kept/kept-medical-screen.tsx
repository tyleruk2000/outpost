/**
 * The household's medical sheets from the copy kept on this phone, while the server is
 * out of reach. With several households the copy is of the one current when it was kept,
 * and says which. A sheet that is not locked is shown as it was kept. A sheet locked with a
 * passphrase was kept as the locked message it is on the server, and is opened here with
 * that passphrase, in memory only: nothing opened is written anywhere, and it closes when
 * the screen does. A sheet locked to a key opens only where that key is.
 */
import { localDay, type MedicalRecord, type MedicalSheet } from "@outpost/shared";
import { CircleAlert, LockKeyhole } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { cryptographyAvailable, getEngine } from "@/features/encryption/engine";
import { PassphraseInput } from "@/features/encryption/parts";
import { openSheet } from "@/features/household-papers/medical-crypto";
import { medicalBlocks } from "@/features/household-papers/medical-words";
import type { Block } from "@/features/propagation/plans/document";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { DEVICE } from "./device";
import { MEDICAL_ID, MEDICAL_PATH } from "./keep";
import { getKept, type KeptMedical, readKeptJson } from "./store";

type Found =
  | { state: "loading" }
  | { state: "not-kept" }
  | { state: "kept"; item: KeptMedical; sheets: MedicalSheet[]; householdName: string | null };

/** A sheet's words, as its printed page has them. */
function SheetBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="grid gap-2">
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        switch (block.kind) {
          case "title":
            return (
              <h2 key={key} className="font-title text-heading text-ink">
                {block.text}
              </h2>
            );
          case "heading":
            return (
              <h3 key={key} className="mt-2 text-body font-semibold text-ink">
                {block.text}
              </h3>
            );
          case "para":
            return (
              <p key={key} className="text-body text-ink">
                {block.text}
              </p>
            );
          case "list":
            return (
              <ul key={key} className="list-disc pl-5 text-body text-ink">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <ul key={key} className="divide-y divide-border border-y border-border text-body text-ink">
                {block.rows.map((row) => (
                  <li key={row.join("|")} className="py-1.5">
                    {row
                      .map((cell, at) => (cell ? `${block.head[at]}: ${cell}` : ""))
                      .filter(Boolean)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

const shown = (sheet: MedicalSheet, record: MedicalRecord) => medicalBlocks(sheet.name, record, {}, localDay());

/** A locked sheet: opened here with its passphrase, held only while this screen is open. */
function LockedSheet({ sheet }: { sheet: MedicalSheet }) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [passphraseLocked, setPassphraseLocked] = useState<boolean | null>(null);
  const armor = sheet.armor ?? "";
  const available = cryptographyAvailable();

  useEffect(() => {
    if (!available || !armor) return;
    let live = true;
    getEngine()
      .then((engine) => engine.messageNeeds(armor))
      .then(
        (needs) => live && setPassphraseLocked(needs.passphrase),
        (failure: unknown) => live && setError(errorMessage(failure)),
      );
    return () => {
      live = false;
    };
  }, [armor, available]);

  if (record) return <SheetBlocks blocks={shown(sheet, record)} />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError(null);
    try {
      setRecord(await openSheet(await getEngine(), armor, { kind: "passphrase", passphrase }));
      setPassphrase("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3">
      <h2 className="flex items-center gap-2 font-title text-heading text-ink">
        <LockKeyhole aria-hidden className="size-5 text-ink-muted" /> Medical sheet: {sheet.name}
      </h2>
      {!available ? (
        <p className="text-small text-ink">
          This sheet is locked, and this page was opened over plain HTTP, where browsers do not allow the cryptography that opens it.
        </p>
      ) : passphraseLocked === null && !error ? (
        <Skeleton className="h-10" />
      ) : passphraseLocked ? (
        <form onSubmit={(event) => void submit(event)} className="grid gap-2">
          <Field label="Passphrase for this sheet">
            {(ids) => (
              <div className="flex flex-wrap gap-2">
                <PassphraseInput
                  {...ids}
                  className="min-w-[14rem] flex-1"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <Button type="submit" variant="primary" loading={busy} disabled={!passphrase}>
                  Open
                </Button>
              </div>
            )}
          </Field>
          <p className="text-small text-ink-muted">Opened here only, and closed again when you leave this screen.</p>
        </form>
      ) : passphraseLocked === false ? (
        <p className="text-small text-ink">
          This sheet is locked to a key, not a passphrase. It opens on Medical sheets when the server is in reach, on a device that holds
          the key.
        </p>
      ) : null}
      {error ? (
        <Notice tone="danger" icon={<CircleAlert />}>
          {error}
        </Notice>
      ) : null}
    </div>
  );
}

export default function KeptMedicalScreen() {
  const [found, setFound] = useState<Found>({ state: "loading" });
  useEffect(() => {
    let live = true;
    void (async () => {
      const item = await getKept("medical", MEDICAL_ID);
      const copy = item
        ? await readKeptJson<{ sheets: MedicalSheet[]; householdName?: string | null }>("medical", MEDICAL_ID, MEDICAL_PATH)
        : undefined;
      if (live)
        setFound(
          item && copy
            ? { state: "kept", item, sheets: copy.sheets, householdName: copy.householdName ?? item.householdName ?? null }
            : { state: "not-kept" },
        );
    })().catch(() => live && setFound({ state: "not-kept" }));
    return () => {
      live = false;
    };
  }, []);

  if (found.state === "loading") {
    return (
      <Page width="reading">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-24" />
      </Page>
    );
  }
  if (found.state === "not-kept") {
    return (
      <Page width="reading">
        <h1 className="font-title text-title text-ink">The medical sheets are not kept on this {DEVICE}</h1>
        <p className="mt-2 max-w-[60ch] text-ink-muted">
          They are on the Outpost server, which is out of reach from here. When it is back in reach, choose “Keep on this {DEVICE}” under
          the list on Medical sheets, and they will open here next time.
        </p>
        <Button asChild variant="primary" className="mt-5">
          <Link to="/kept">See what is kept</Link>
        </Button>
      </Page>
    );
  }
  return (
    <Page width="reading">
      <h1 className="font-title text-title text-ink">Medical sheets</h1>
      {found.householdName ? <p className="mt-1 text-small text-ink-muted">For {found.householdName}</p> : null}
      <p className="mt-2 max-w-[60ch] text-small text-ink-muted">
        The copy kept on this {DEVICE}, from {formatDateTime(found.item.refreshedAt)}. A change made since on the server is not in it.
      </p>
      {found.sheets.length === 0 ? (
        <p className="mt-6 text-body text-ink-muted">There were no medical sheets when the copy was made.</p>
      ) : (
        <div className="mt-6 grid gap-8">
          {found.sheets.map((sheet) => (
            <section key={sheet.id} aria-label={`Medical sheet: ${sheet.name}`}>
              {sheet.encrypted || !sheet.record ? <LockedSheet sheet={sheet} /> : <SheetBlocks blocks={shown(sheet, sheet.record)} />}
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
