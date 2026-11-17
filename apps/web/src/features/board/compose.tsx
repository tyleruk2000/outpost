/**
 * Writing on the board: choosing the name this device posts under, a message, and a file
 * sent for another device to save.
 *
 * The name is chosen once on each device and kept there (`outpost.board.name`); it can
 * be changed at any time. It proves nothing, and the screen says so.
 */
import { type BoardMessageResponse, type BoardSummaryResponse, formatBytes } from "@outpost/shared";
import { Paperclip, Send, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { errorMessage, uploadWithProgress } from "@/lib/api";
import { setDeviceName, usePost, useReplace } from "./data";

/** Choosing a name: the household's people where Outpost holds them, or one typed. */
export function ChooseName({ people, current, onDone }: { people: string[]; current: string | null; onDone?: () => void }) {
  const [typed, setTyped] = useState(current ?? "");
  const choose = (name: string) => {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) return;
    setDeviceName(clean);
    onDone?.();
  };
  return (
    <div>
      {people.length > 0 ? (
        <>
          <p className="text-small text-ink-muted">The household, as Outpost holds it under Supplies and the emergency plans:</p>
          <ul aria-label="The household's people" className="mt-2 flex flex-wrap gap-2">
            {people.map((person) => (
              <li key={person}>
                <Button variant={person === current ? "soft" : "secondary"} onClick={() => choose(person)}>
                  {person}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          choose(typed);
        }}
      >
        <Field label={people.length > 0 ? "Or type a name" : "Your name"} className="min-w-[12rem] flex-1">
          {(ids) => (
            <Input {...ids} value={typed} maxLength={40} autoComplete="given-name" onChange={(event) => setTyped(event.target.value)} />
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={!typed.trim()}>
          Use this name
        </Button>
        {onDone && current ? (
          <Button variant="ghost" onClick={onDone}>
            Keep {current}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

export function WriteMessage({ name }: { name: string }) {
  const [text, setText] = useState("");
  const post = usePost();
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim()) return;
    post.mutate({ author: name, body: text }, { onSuccess: () => setText(""), onError: (error) => toast.error(errorMessage(error)) });
  };
  return (
    <form onSubmit={submit} className="grid gap-2">
      <Field
        label={`Write a message as ${name}`}
        hint="Text pasted here can be picked up on any other device: it is a message like any other."
      >
        {(ids) => (
          <Textarea
            {...ids}
            value={text}
            rows={3}
            maxLength={10_000}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl or ⌘ and Enter sends; Enter alone is a new line, as a note on paper would have.
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
            }}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular text-micro text-ink-muted">
          {text.length > 9_000 ? `${(10_000 - text.length).toLocaleString("en-GB")} characters left` : ""}
        </span>
        <Button type="submit" variant="primary" loading={post.isPending} disabled={!text.trim()}>
          <Send aria-hidden /> Post
        </Button>
      </div>
    </form>
  );
}

const keptWords = (days: number) =>
  days === 0 ? "kept until someone removes it" : `kept for ${days === 1 ? "a day" : `${days} days`}, then removed`;

export function SendFile({ name, summary }: { name: string; summary: BoardSummaryResponse | undefined }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [words, setWords] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const sending = useRef<AbortController | null>(null);
  const replace = useReplace();
  const limit = summary?.limits.fileBytes ?? 0;
  const tooBig = file !== null && limit > 0 && file.size > limit;

  const clear = () => {
    setFile(null);
    setWords("");
    if (input.current) input.current.value = "";
  };

  const send = async () => {
    if (!file || tooBig) return;
    const form = new FormData();
    // The fields before the file: the server reads them first.
    form.append("author", name);
    form.append("body", words);
    form.append("file", file, file.name);
    const controller = new AbortController();
    sending.current = controller;
    setProgress(0);
    try {
      const { message } = await uploadWithProgress<BoardMessageResponse>("/api/board/files", form, setProgress, controller.signal);
      replace(message, true);
      toast.success(`Sent “${file.name}”`);
      clear();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error(errorMessage(error));
    } finally {
      sending.current = null;
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-3">
      <p className="text-small text-ink-muted">
        A file or a photo, for anyone on the home network to save to their own device. Up to {limit ? formatBytes(limit) : "…"},{" "}
        {summary ? keptWords(summary.fileDays) : "…"} (Settings, Message board). It is never opened on the server.
      </p>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="grid gap-2 rounded-panel border border-border p-3">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 font-medium break-words text-ink">{file.name}</span>
            <span className="tabular text-small text-ink-muted">{formatBytes(file.size)}</span>
          </p>
          {tooBig ? (
            <p role="alert" className="text-small text-danger">
              This is larger than {formatBytes(limit)}, the most a file sent on the board can be.
            </p>
          ) : null}
          <Field label="A few words with it" optional>
            {(ids) => <Input {...ids} value={words} maxLength={2000} onChange={(event) => setWords(event.target.value)} />}
          </Field>
          {progress !== null ? <Progress value={progress} label={`Sending ${file.name}`} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {progress !== null ? (
              <Button variant="secondary" onClick={() => sending.current?.abort()}>
                <X aria-hidden /> Stop
              </Button>
            ) : (
              <Button variant="secondary" onClick={clear}>
                Choose another
              </Button>
            )}
            <Button variant="primary" disabled={tooBig} loading={progress !== null} onClick={() => void send()}>
              <Send aria-hidden /> Send to the board
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button onClick={() => input.current?.click()}>
            <Paperclip aria-hidden /> Choose a file or photo
          </Button>
        </div>
      )}
    </div>
  );
}
