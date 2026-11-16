/**
 * QR codes: text, a web address, a contact, a Wi-Fi network, a phone number, an email
 * address or a saved place, as a code a phone's camera reads.
 *
 * The code is made in this page by `encoder.ts`. What is typed here stays in the page's
 * memory: it is not sent to the server, not stored on it or in the browser, not logged,
 * and not put in the address. The only requests the screen makes are to list the
 * person's own contacts or saved places when they choose to start from one, and to add
 * the printed sheet to the library when they press "Add to library".
 */
import type { MarkerDto } from "@outpost/shared";
import { LockKeyhole } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Notice, Page, PageHeader } from "@/components/page";
import { Field } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { describe, EC_WORDS, KIND_LABELS, missing, type QrContent, type QrKind } from "./content";
import { byteCapacity, EC_LEVELS, type EcLevel, encodeQr, QrTooLongError } from "./encoder";
import { emptyQrContact, type QrContact, type WifiInput } from "./payloads";
import { ContactForm, type ContactSource, NumberForm, PlaceForm, TextForm, WifiForm } from "./qr-forms";
import { QrOutput } from "./qr-output";
import "./qr.css";

const KINDS: QrKind[] = ["text", "wifi", "contact", "phone", "email", "place"];

export default function QrPage() {
  const [kind, setKind] = useState<QrKind>("text");
  const [level, setLevel] = useState<EcLevel>("M");
  const [text, setText] = useState("");
  const [wifi, setWifi] = useState<WifiInput>({ ssid: "", security: "WPA", password: "", hidden: false });
  const [contactSource, setContactSource] = useState<ContactSource>("typed");
  const [typedContact, setTypedContact] = useState<QrContact>(emptyQrContact);
  const [pickedContact, setPickedContact] = useState<QrContact | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [place, setPlace] = useState<MarkerDto | null>(null);
  const [passwordInWords, setPasswordInWords] = useState(false);
  const onPicked = useCallback((contact: QrContact | null) => setPickedContact(contact), []);

  const content: QrContent | null = useMemo(() => {
    switch (kind) {
      case "text":
        return { kind, text };
      case "wifi":
        return { kind, wifi };
      case "contact": {
        const contact = contactSource === "typed" ? typedContact : pickedContact;
        return contact ? { kind, contact } : null;
      }
      case "phone":
        return { kind, number: phone };
      case "email":
        return { kind, address: email };
      case "place":
        return place ? { kind, name: place.name || "Unnamed place", lat: place.lat, lon: place.lon } : null;
    }
  }, [kind, text, wifi, contactSource, typedContact, pickedContact, phone, email, place]);

  const waiting = content ? missing(content) : kind === "contact" ? "Choose a contact." : "Choose a saved place.";
  const described = useMemo(
    () => (content && !waiting ? describe(content, { showPassword: passwordInWords }) : null),
    [content, waiting, passwordInWords],
  );
  const result = useMemo(() => {
    if (!described) return null;
    try {
      return { code: encodeQr(described.payload, { ecLevel: level }) };
    } catch (error) {
      if (error instanceof QrTooLongError) return { tooLong: new TextEncoder().encode(described.payload).length };
      throw error;
    }
  }, [described, level]);

  return (
    <Page width="wide">
      <PageHeader
        title="QR codes"
        description="Make a code a phone’s camera can read: text or a web address, a contact, a Wi-Fi network and its password, a phone number, an email address or a saved place."
      />
      <p className="-mt-4 mb-8 flex max-w-[65ch] items-start gap-2 text-small text-ink-muted">
        <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
        Made on this device. What you type here is never sent to the server, stored, logged, put in a web address or kept in the browser.
      </p>

      <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="grid min-w-0 gap-6">
          <Field label="What the code holds">
            {(ids) => (
              <Select<QrKind>
                id={ids.id}
                value={kind}
                onChange={setKind}
                options={KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))}
              />
            )}
          </Field>

          {kind === "text" ? <TextForm text={text} onChange={setText} /> : null}
          {kind === "wifi" ? <WifiForm wifi={wifi} onChange={setWifi} /> : null}
          {kind === "contact" ? (
            <ContactForm
              source={contactSource}
              onSource={setContactSource}
              typed={typedContact}
              onTyped={setTypedContact}
              onPicked={onPicked}
            />
          ) : null}
          {kind === "phone" ? <NumberForm kind="phone" value={phone} onChange={setPhone} /> : null}
          {kind === "email" ? <NumberForm kind="email" value={email} onChange={setEmail} /> : null}
          {kind === "place" ? <PlaceForm placeId={place?.id} onChange={setPlace} /> : null}

          <div className="grid gap-2 border-t border-border pt-5">
            <span id="qr-level" className="text-small font-medium text-ink">
              Error correction
            </span>
            <Segmented<EcLevel>
              label="Error correction"
              value={level}
              onChange={setLevel}
              options={EC_LEVELS.map((value) => ({ value, label: value }))}
              className="justify-self-start"
            />
            <p className="text-small text-ink-muted">{EC_WORDS[level]}</p>
          </div>
        </div>

        <section aria-label="The code" className="min-w-0 md:sticky md:top-6">
          {!described ? (
            <div className="grid gap-3">
              <div
                className="mx-auto grid aspect-square w-full max-w-[22rem] place-items-center rounded-panel border border-dashed border-border-strong bg-surface p-8 text-center"
                data-testid="qr-waiting"
              >
                <p className="text-small text-ink-muted">{waiting}</p>
              </div>
            </div>
          ) : result && "tooLong" in result && result.tooLong !== undefined ? (
            <Notice tone="warning" title="Too much for one code">
              This is {result.tooLong.toLocaleString("en-GB")} bytes, and the most a code holds at level {level} is{" "}
              {byteCapacity(level).toLocaleString("en-GB")}. Put less in it, or choose a lower level of error correction. A code that large
              is hard for a phone to read anyway.
            </Notice>
          ) : result ? (
            <QrOutput
              code={result.code}
              described={described}
              kind={kind}
              passwordInWords={passwordInWords}
              onPasswordInWords={setPasswordInWords}
            />
          ) : null}
        </section>
      </div>
    </Page>
  );
}
