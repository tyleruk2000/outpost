/**
 * An encrypted page must not lose what was typed into it: not when the key's five
 * minutes run out during a long edit, not when the page is left while a save is under
 * way, and not when the person goes idle.
 *
 * The clock is a fake one. The engine is a stand-in that takes a second to encrypt and a
 * second to decrypt, as the real one does when it stretches a passphrase, and that
 * refuses a key that has been forgotten, as the real one does. The editor is a text box
 * that is destroyed a moment after it leaves the screen, as Tiptap's is.
 */
import { encryptedNoteArmor, encryptedNoteDoc, type NoteDetail, type NoteDoc, type UpdateNoteBody } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/misc";
import type { DecryptWith, EncryptTo, KeyInfo, UnlockedKey } from "@/features/encryption/engine";
import type { ShelfKey } from "@/features/encryption/keys-data";
import { readPayload } from "@/features/encryption/pages";
import { lock, lockAll, UNLOCK_IDLE_MS, unlockedSnapshot } from "@/features/encryption/session";
import EncryptedNote from "./encrypted-note";
import { saveNote } from "./notes-data";

const FINGERPRINT = "151fbadc2a20b68334bd7c9846c88eda032bf66d";
const KEY_ID = "46c88eda032bf66d";
/** How long the stand-in engine takes over each encryption and each decryption. */
const SLOW_MS = 1000;
/** Mirrors SAVE_DELAY_MS in encrypted-note.tsx. */
const SAVE_DELAY_MS = 2000;
/** A whole save: the wait after the last keystroke, encrypting, and decrypting again to check. */
const SAVE_MS = SAVE_DELAY_MS + 2 * SLOW_MS;

// ── Stand-ins ──

interface Sealed {
  text: string;
  passphrase?: string;
  keyIds: string[];
}
const seal = (message: Sealed) => `-----BEGIN PGP MESSAGE-----\n\n${btoa(JSON.stringify(message))}\n-----END PGP MESSAGE-----`;
const unseal = (armor: string) => JSON.parse(atob(armor.trim().split("\n")[2] ?? "")) as Sealed;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeKey implements UnlockedKey {
  readonly fingerprint = FINGERPRINT;
  forgotten = false;
  forget() {
    this.forgotten = true;
  }
}

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

vi.mock("@/features/encryption/engine", async (original) => {
  const real = await original<typeof import("@/features/encryption/engine")>();
  const engine = {
    library: "stand-in",
    async messageNeeds(armor: string) {
      const message = unseal(armor);
      return { keyIds: message.keyIds, passphrase: message.passphrase !== undefined, encrypted: true };
    },
    async encryptText(text: string, to: EncryptTo) {
      await pause(SLOW_MS);
      return seal({ text, passphrase: to.passphrase, keyIds: to.recipients ? [KEY_ID] : [] });
    },
    async decryptText(armor: string, using: DecryptWith) {
      await pause(SLOW_MS);
      const message = unseal(armor);
      if (message.passphrase !== undefined) {
        if (using.passphrase !== message.passphrase) throw new real.PgpError("tampered", "The passphrase is wrong.");
      } else {
        const key = using.keys?.[0] as FakeKey | undefined;
        if (!key || key.forgotten) throw new real.PgpError("failed", "This key was locked again. Unlock it with its passphrase.");
      }
      return { text: message.text, signatures: [] };
    },
  };
  return { ...real, cryptographyAvailable: () => true, getEngine: () => Promise.resolve(engine) };
});

vi.mock("@/features/encryption/keys-data", async (original) => {
  const real = await original<typeof import("@/features/encryption/keys-data")>();
  const session = await import("@/features/encryption/session");
  return {
    ...real,
    useShelf: () => ({ data: { keys: [shelfKey], unreadable: [] }, isPending: false }),
    // The passphrase is not checked here: unlocking is the real engine's work, tested with it.
    async unlock() {
      const key = new FakeKey();
      session.holdUnlocked(key);
      return key;
    },
  };
});

vi.mock("./notes-data", async (original) => {
  const real = await original<typeof import("./notes-data")>();
  return {
    ...real,
    saveNote: vi.fn(),
    useNoteActions: () => ({ create: vi.fn(), setFavorite: vi.fn() }),
    useNoteTree: () => ({ data: undefined }),
  };
});

vi.mock("./use-page-saver", () => ({
  usePageSaver: () => ({ saver: { current: null }, status: { kind: "saved" } }),
  readDraft: () => null,
  clearDraft: () => {},
}));

/** A text box in place of Tiptap, with as much of an editor behind it as the page reads. */
vi.mock("./editor/note-editor", async () => {
  const { useEffect, useState } = await import("react");
  function NoteEditor(props: { content: NoteDoc; editable: boolean; onChange(): void; onEditor(editor: unknown): void }) {
    const [editor] = useState(() => {
      let doc = props.content;
      let destroyed = false;
      return {
        get isDestroyed() {
          return destroyed;
        },
        getJSON: () => doc,
        // As in ProseMirror: each document is a value of its own, which later typing does not change.
        get state() {
          const now = doc;
          return { doc: { toJSON: () => now } };
        },
        commands: { focus() {} },
        type(text: string) {
          doc = docOf(text);
        },
        destroy() {
          destroyed = true;
        },
      };
    });
    useEffect(() => {
      props.onEditor(editor);
      return () => {
        props.onEditor(null);
        // Tiptap destroys its editor a millisecond after the component goes.
        setTimeout(() => editor.destroy(), 1);
      };
    }, []);
    return (
      <textarea
        aria-label="Page content"
        readOnly={!props.editable}
        defaultValue={textOf(props.content)}
        onChange={(event) => {
          editor.type(event.target.value);
          props.onChange();
        }}
      />
    );
  }
  return { NoteEditor };
});

// ── The page under test ──

const docOf = (text: string): NoteDoc => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const textOf = (doc: NoteDoc): string => {
  const first = doc.content[0];
  return first?.type === "paragraph" ? (first.content ?? []).map((node) => ("text" in node ? node.text : "")).join("") : "";
};
const payload = (text: string) => JSON.stringify({ outpost: "encrypted-page", version: 1, content: docOf(text) });

const info: KeyInfo = {
  fingerprint: FINGERPRINT,
  keyId: KEY_ID,
  keyIds: [KEY_ID],
  userIds: ["Ada Lovelace <ada@example.org>"],
  name: "Ada Lovelace",
  email: "ada@example.org",
  createdAt: 0,
  expiresAt: null,
  algorithm: "Curve25519",
  status: "valid",
  statusReason: null,
  canEncrypt: true,
  canSign: true,
  gnupgReadable: true,
};
const shelfKey: ShelfKey = {
  fingerprint: FINGERPRINT,
  info,
  publicKey: "public",
  mine: true,
  onShelf: true,
  privateOnDevice: true,
  privateOnOutpost: false,
  checkedAt: null,
  addedAt: 0,
};

function noteWith(armor: string): NoteDetail {
  return {
    id: "n1",
    title: "Diary",
    icon: null,
    parentId: null,
    content: encryptedNoteDoc(armor),
    encrypted: true,
    tags: [],
    isFavorite: false,
    isTemplate: false,
    position: 0,
    coverAttachmentId: null,
    coverUrl: null,
    breadcrumbs: [],
    backlinks: [],
    children: [],
    trashedAt: null,
    createdAt: 0,
    updatedAt: 1,
    lastViewedAt: null,
  } as NoteDetail;
}

/**
 * Moves the clock on, letting everything that was waiting run. It goes a quarter of a
 * second at a time, so that the screen is drawn again as it would be, and not once at the end.
 */
async function pass(ms: number) {
  for (let left = ms; left >= 0; left -= 250) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(left, 250));
    });
    if (left === 0) break;
  }
}

function show(armor: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <EncryptedNote note={noteWith(armor)} />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function openWithPassphrase() {
  const view = show(seal({ text: payload("start"), passphrase: "correct horse", keyIds: [] }));
  await pass(0);
  fireEvent.change(screen.getByLabelText("Passphrase for this page"), { target: { value: "correct horse" } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await pass(SLOW_MS);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return view;
}

async function openWithKey() {
  const view = show(seal({ text: payload("start"), keyIds: [KEY_ID] }));
  await pass(0);
  fireEvent.change(screen.getByLabelText("Passphrase for Ada Lovelace’s key"), { target: { value: "whatever it is" } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
  await pass(SLOW_MS);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return view;
}

/** Types as a person does: a key goes down, and the text changes. */
function type(text: string) {
  fireEvent.keyDown(screen.getByLabelText("Page content"), { key: "a" });
  fireEvent.change(screen.getByLabelText("Page content"), { target: { value: text } });
}

/** The text inside every message that was stored, oldest first. */
function stored(): string[] {
  return vi.mocked(saveNote).mock.calls.map(([, body]) => {
    const armor = encryptedNoteArmor((body as UpdateNoteBody).content);
    if (armor === null) throw new Error("something other than an encrypted page was saved");
    return textOf(readPayload(unseal(armor).text).content);
  });
}

const isLocked = () => screen.queryByTestId("encrypted-page-locked") !== null;

let version = 1;
beforeEach(() => {
  vi.useFakeTimers();
  version = 1;
  vi.mocked(saveNote).mockReset();
  vi.mocked(saveNote).mockImplementation(async () => {
    version += 1;
    const note = {
      id: "n1",
      title: "Diary",
      icon: null,
      tags: [],
      isFavorite: false,
      isTemplate: false,
      coverAttachmentId: null,
      coverUrl: null,
    };
    return { note: { ...note, updatedAt: version } };
  });
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  lockAll();
  vi.useRealTimers();
});

describe("a long edit of a page opened with a key", () => {
  it("is still saved after more than five minutes of typing", async () => {
    await openWithKey();
    // A word every half minute, for seven minutes.
    for (let words = 1; words <= 14; words += 1) {
      type(`word ${words}`);
      await pass(30_000);
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(stored().at(-1)).toBe("word 14");
    expect(stored()).toHaveLength(14);
  });

  it("keeps the key for as long as the page is being read, so that an edit after five minutes can be saved", async () => {
    await openWithKey();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await pass(0);
    // Reading: a click or a key now and then, but nothing that uses the key.
    for (let minute = 0; minute < 7; minute += 1) {
      fireEvent.pointerDown(document.body);
      await pass(60_000);
    }
    expect(isLocked()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    type("added later");
    await pass(SAVE_MS);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(stored()).toEqual(["added later"]);
  });

  it("offers to unlock the key again, and then saves what was typed, if the key is found locked", async () => {
    await openWithKey();
    type("typed before the key went");
    lock(FINGERPRINT);
    await pass(SAVE_MS);
    expect(stored()).toEqual([]);

    // Not a dead end: the text is still there, and so is a way to save it.
    expect(screen.getByLabelText("Page content")).toHaveValue("typed before the key went");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Your changes to the text have not been saved");
    fireEvent.change(screen.getByLabelText("Passphrase for Ada Lovelace’s key"), { target: { value: "whatever it is" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock and save" }));
    await pass(2 * SLOW_MS);

    expect(stored()).toEqual(["typed before the key went"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // "Done" and "Lock" work again.
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    await pass(0);
    expect(isLocked()).toBe(true);
  });
});

describe("a page opened with a passphrase", () => {
  // The passphrase stays with the page, so there was no key to lose here. This keeps it that way.
  it("is still saved after more than five minutes of typing", async () => {
    await openWithPassphrase();
    for (let words = 1; words <= 14; words += 1) {
      type(`word ${words}`);
      await pass(30_000);
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(stored().at(-1)).toBe("word 14");
  });
});

describe("typing while a save is under way", () => {
  it("is saved by the next save, and the page is not called saved before then", async () => {
    await openWithPassphrase();
    type("one");
    await pass(SAVE_DELAY_MS + SLOW_MS / 2);
    type("one two");
    // The first save has finished; the second has not started.
    await pass(2 * SLOW_MS - SLOW_MS / 2 + 250);
    expect(stored()).toEqual(["one"]);
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
    await pass(SAVE_MS);
    expect(stored()).toEqual(["one", "one two"]);
    expect(screen.queryByText("Not saved yet")).not.toBeInTheDocument();
  });

  it("keeps “Done” on the editor until the newest text is the one that was saved", async () => {
    await openWithPassphrase();
    type("one");
    await pass(SAVE_DELAY_MS + SLOW_MS / 2);
    type("one two");
    // “Done” waits for the save under way, as its spinner shows.
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    await pass(2 * SLOW_MS - SLOW_MS / 2 + 250);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await pass(SLOW_MS);
    // Still the editor, with what was typed in it, while the second save runs.
    expect(screen.getByLabelText("Page content")).not.toHaveAttribute("readonly");
    await pass(2 * SLOW_MS);
    expect(stored()).toEqual(["one", "one two"]);
    expect(screen.getByLabelText("Page content")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Page content")).toHaveValue("one two");
  });
});

describe("going idle", () => {
  it("locks the page and forgets the key after five minutes without a key or a pointer, with the text saved first", async () => {
    await openWithKey();
    type("the last thing typed");
    await pass(UNLOCK_IDLE_MS - 1000);
    expect(isLocked()).toBe(false);
    expect(stored()).toEqual(["the last thing typed"]);
    // Saving used the key a few seconds after the last keystroke; it is forgotten five minutes after that.
    await pass(1000 + 2 * SAVE_MS);
    expect(isLocked()).toBe(true);
    expect(unlockedSnapshot().has(FINGERPRINT)).toBe(false);
  });

  it("tries once more to save what could not be saved, and only then locks", async () => {
    await openWithPassphrase();
    vi.mocked(saveNote).mockRejectedValueOnce(new Error("Outpost could not be reached."));
    type("typed while the network was down");
    await pass(SAVE_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("Outpost could not be reached.");
    expect(stored()).toHaveLength(1);

    await pass(UNLOCK_IDLE_MS);
    expect(stored().at(-1)).toBe("typed while the network was down");
    expect(vi.mocked(saveNote)).toHaveBeenCalledTimes(2);
    expect(isLocked()).toBe(true);
  });

  it("stays open, with the text and the notice, for as long as it cannot be saved", async () => {
    await openWithPassphrase();
    vi.mocked(saveNote).mockRejectedValue(new Error("Outpost could not be reached."));
    type("never saved");
    await pass(3 * UNLOCK_IDLE_MS);
    expect(isLocked()).toBe(false);
    expect(screen.getByLabelText("Page content")).toHaveValue("never saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Your changes to the text have not been saved");
  });
});

describe("leaving the page", () => {
  it("saves what was typed while an earlier save was under way", async () => {
    const view = await openWithPassphrase();
    type("one");
    await pass(SAVE_DELAY_MS + SLOW_MS / 2);
    expect(screen.getByText("Encrypting and saving…")).toBeInTheDocument();
    type("one two three");
    view.unmount();
    await pass(10 * SLOW_MS);

    expect(stored()).toEqual(["one", "one two three"]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("lets a save that is under way finish before the key is forgotten", async () => {
    const view = await openWithKey();
    expect([...unlockedSnapshot().keys()]).toEqual([FINGERPRINT]);
    type("one");
    await pass(SAVE_DELAY_MS + SLOW_MS / 2);
    view.unmount();
    await pass(10 * SLOW_MS);

    expect(stored()).toEqual(["one"]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(unlockedSnapshot().size).toBe(0);
  });

  it("says so when the last changes could not be saved, rather than reporting nothing", async () => {
    const view = await openWithPassphrase();
    vi.mocked(saveNote).mockRejectedValue(new Error("Outpost could not be reached."));
    type("one");
    view.unmount();
    await pass(10 * SLOW_MS);
    expect(toast.error).toHaveBeenCalledWith("Your last changes to an encrypted page could not be saved before you left it.");
  });

  it("asks the browser to wait before closing the tab while something is unsaved or being saved, and not otherwise", async () => {
    await openWithPassphrase();
    const closing = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(closing()).toBe(false);
    type("one");
    expect(closing()).toBe(true);
    await pass(SAVE_DELAY_MS + SLOW_MS / 2);
    expect(closing()).toBe(true);
    await pass(2 * SLOW_MS);
    expect(closing()).toBe(false);
  });
});
