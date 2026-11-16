/** Small helpers for showing keys and handing over files. */
import type { KeyInfo } from "./engine";

/**
 * A fingerprint as it is read aloud and compared: capitals in groups of four, a wider
 * gap in the middle, the way GnuPG prints it. A 40-digit fingerprint makes ten groups;
 * a version 6 key's 64 digits make sixteen.
 */
export function fingerprintGroups(fingerprint: string): string[] {
  return fingerprint.toUpperCase().match(/.{1,4}/g) ?? [];
}

/** The groups as text, for copying: "ABCD 1234 …  …" with two spaces at the middle. */
export function formatFingerprint(fingerprint: string): string {
  const groups = fingerprintGroups(fingerprint);
  const half = groups.length / 2;
  return `${groups.slice(0, half).join(" ")}  ${groups.slice(half).join(" ")}`;
}

/** What to call a key in a list or a sentence: the name it gives, else its address, else its key ID. */
export function keyLabel(info: Pick<KeyInfo, "name" | "email" | "keyId">): string {
  return info.name || info.email || `Key ${info.keyId.toUpperCase()}`;
}

/** A name that is safe to give a downloaded file, whatever the key or the message says about itself. */
export function safeDownloadName(name: string, fallback: string): string {
  const cleaned = name
    .normalize("NFKC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being removed
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

/** "Ada Lovelace" → "ada-lovelace", for the file name of an exported key. */
export function slug(text: string, fallback: string): string {
  const made = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return made || fallback;
}

/** Starts a download of `data` under `filename`. Nothing is sent anywhere: the file is made in the browser. */
export function download(data: Blob | string, filename: string, type = "application/octet-stream"): void {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for the browser to have started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
