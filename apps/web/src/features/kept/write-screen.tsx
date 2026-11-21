/**
 * Writing while the server is out of reach: a check-in, or a new page of notes, kept on
 * this phone and sent when Outpost is back (`outbox.ts`). The list of what is waiting is
 * shown here and on "On this device". Nothing here asks the server.
 */
import type { CheckInStatus } from "@outpost/shared";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Page, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { setDeviceName, useDeviceName } from "@/features/board/data";
import { notify } from "@/lib/notify";
import { DEVICE } from "./device";
import { addCheckIn, addPage } from "./outbox";
import { OutboxList } from "./outbox-list";
import { outOfRoomMessage } from "./store";

function failed(error: unknown) {
  notify.error(outOfRoomMessage(error) ?? `This ${DEVICE} could not keep it. Nothing was written.`);
}

function CheckInForm() {
  const stored = useDeviceName();
  const [name, setName] = useState(stored ?? "");
  const [place, setPlace] = useState("");
  const [words, setWords] = useState("");
  const [pending, setPending] = useState<CheckInStatus | null>(null);

  const send = async (status: CheckInStatus, event?: FormEvent) => {
    event?.preventDefault();
    const author = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!author) {
      notify.error("Write your name first.");
      return;
    }
    if (status === "other" && !words.trim()) {
      notify.error("Write a few words, or choose I'm safe or I need help.");
      return;
    }
    setPending(status);
    try {
      if (author !== stored) setDeviceName(author);
      await addCheckIn({ author, status, body: words.trim(), place: place.trim() || null });
      toast.success("Kept on this phone. It goes on the board when Outpost is back in reach.");
      setWords("");
      setPlace("");
    } catch (error) {
      failed(error);
    } finally {
      setPending(null);
    }
  };

  return (
    <form onSubmit={(event) => void send("safe", event)} className="grid gap-3">
      <Field label="Your name">
        {(ids) => <Input {...ids} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} autoComplete="off" />}
      </Field>
      <Field label="Where you are, in a few words" optional>
        {(ids) => <Input {...ids} value={place} maxLength={120} onChange={(event) => setPlace(event.target.value)} autoComplete="off" />}
      </Field>
      <Field label="Your words" optional>
        {(ids) => <Textarea {...ids} rows={2} value={words} maxLength={2000} onChange={(event) => setWords(event.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="lg" loading={pending === "safe"}>
          <ShieldCheck aria-hidden /> I'm safe
        </Button>
        <Button size="lg" variant="secondary" className="text-danger" loading={pending === "help"} onClick={() => void send("help")}>
          <CircleAlert aria-hidden /> I need help
        </Button>
        <Button size="lg" variant="ghost" loading={pending === "other"} onClick={() => void send("other")}>
          Just my words
        </Button>
      </div>
    </form>
  );
}

function PageForm() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() && !text.trim()) return;
    setBusy(true);
    try {
      await addPage({ title: title.trim(), text });
      toast.success("Kept on this phone. It becomes a new page in Notes when Outpost is back in reach.");
      setTitle("");
      setText("");
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <Field label="Title">
        {(ids) => <Input {...ids} value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />}
      </Field>
      <Field label="Text" hint="Plain text. Pictures, links to other pages and formatting can be added once it is in Notes.">
        {(ids) => <Textarea {...ids} rows={8} value={text} onChange={(event) => setText(event.target.value)} />}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={busy} disabled={!title.trim() && !text.trim()}>
          Keep the page
        </Button>
      </div>
    </form>
  );
}

export default function WriteScreen() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title text-ink">Write while out of reach</h1>
      <p className="mt-2 max-w-[60ch] text-ink-muted">
        A check-in or a new page is kept on this {DEVICE} and sent when Outpost is next in reach. Pages already in Notes are read-only here.
      </p>
      <Section title="Check in" className="mt-8">
        <CheckInForm />
      </Section>
      <Section title="A new page">
        <PageForm />
      </Section>
      <Section title="Waiting to be sent">
        <OutboxList />
      </Section>
    </Page>
  );
}
