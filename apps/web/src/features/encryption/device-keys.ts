/**
 * What this browser keeps for itself, in its own storage and nowhere else:
 *
 * - private keys, always in the form their passphrase protects (the same armoured text
 *   that "Save a copy of the private key" writes to a file);
 * - which keys the person using this browser has checked with their owner, by
 *   fingerprint.
 *
 * Neither is sent to the server. Outpost has no accounts, so anything on the server is
 * everyone's: a "checked" mark kept there could be set by anyone on the network, and
 * would mean nothing. Kept here, it means "someone at this device compared this
 * fingerprint", and a key swapped on the server for another shows up as unchecked.
 *
 * Clearing the browser's site data erases both. A private key kept only here has no
 * other copy unless the person saved one; the screen says so.
 */
const KEYS = "outpost.encryption.private-keys.v1";
const CHECKED = "outpost.encryption.checked.v1";
const CHANGED = "outpost:encryption-device-changed";

interface StoredPrivateKey {
  /** ASCII-armoured, passphrase-protected. */
  privateKey: string;
  savedAt: number;
}

function read<T>(key: string): Record<string, T> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function write(key: string, value: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("This browser would not store the key (its storage is full or switched off). Nothing was saved on this device.");
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Fingerprints of the private keys kept in this browser. */
export function devicePrivateKeys(): Record<string, StoredPrivateKey> {
  const stored = read<StoredPrivateKey>(KEYS);
  return Object.fromEntries(
    Object.entries(stored).filter(([, value]) => typeof value?.privateKey === "string" && value.privateKey.includes("PRIVATE KEY BLOCK")),
  );
}

export function devicePrivateKey(fingerprint: string): string | null {
  return devicePrivateKeys()[fingerprint.toLowerCase()]?.privateKey ?? null;
}

/** Keeps a private key in this browser. The caller has already made sure it is passphrase-protected. */
export function saveDevicePrivateKey(fingerprint: string, privateKey: string): void {
  write(KEYS, { ...devicePrivateKeys(), [fingerprint.toLowerCase()]: { privateKey, savedAt: Date.now() } satisfies StoredPrivateKey });
}

export function removeDevicePrivateKey(fingerprint: string): void {
  const { [fingerprint.toLowerCase()]: _removed, ...rest } = devicePrivateKeys();
  write(KEYS, rest);
}

/** When each key was marked as checked with its owner on this device. */
export function checkedKeys(): Record<string, number> {
  const stored = read<number>(CHECKED);
  return Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === "number"));
}

export function setKeyChecked(fingerprint: string, checked: boolean): void {
  const { [fingerprint.toLowerCase()]: _was, ...rest } = checkedKeys();
  write(CHECKED, checked ? { ...rest, [fingerprint.toLowerCase()]: Date.now() } : rest);
}

/** Calls back when this tab or another changes what the browser keeps. */
export function onDeviceKeysChanged(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEYS || event.key === CHECKED || event.key === null) listener();
  };
  window.addEventListener(CHANGED, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener("storage", onStorage);
  };
}
