/**
 * The keys a person sees: what is on Outpost's shelf, joined with what this browser
 * keeps for itself, each read and checked by the engine.
 *
 * Nothing the server says about a key is taken on trust except its bytes. The name,
 * the fingerprint, whether it has expired: all of that is worked out here from the key.
 */
import type { StoredKeyResponse, StoredKeysResponse, StoredPrivateKeyResponse } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { checkedKeys, devicePrivateKey, devicePrivateKeys, onDeviceKeysChanged } from "./device-keys";
import { getEngine, type KeyInfo, PgpError, type UnlockedKey } from "./engine";
import { holdUnlocked, subscribeUnlocked, unlockedKey, unlockedSnapshot } from "./session";

export interface ShelfKey {
  fingerprint: string;
  info: KeyInfo;
  /** Armoured public key. */
  publicKey: string;
  /** Listed under "My keys": the private half is here, or someone said the key was theirs when adding it. */
  mine: boolean;
  /** The public key is on Outpost, where every device can see it. */
  onShelf: boolean;
  privateOnDevice: boolean;
  privateOnOutpost: boolean;
  /** When someone at this device marked the fingerprint as checked with the key's owner. */
  checkedAt: number | null;
  addedAt: number | null;
}

/** A stored key that could not be read, kept in the list so that it can be seen and removed. */
export interface UnreadableKey {
  fingerprint: string;
  reason: string;
}

export interface Shelf {
  keys: ShelfKey[];
  unreadable: UnreadableKey[];
}

export const encryptionKeys = { all: ["encryption"] as const, shelf: ["encryption", "keys"] as const };

async function loadShelf(): Promise<Shelf> {
  const [{ keys: stored }, engine] = await Promise.all([api.get<StoredKeysResponse>("/api/encryption/keys"), getEngine()]);
  const device = devicePrivateKeys();
  const checked = checkedKeys();
  const keys: ShelfKey[] = [];
  const unreadable: UnreadableKey[] = [];
  const seen = new Set<string>();

  for (const entry of stored) {
    try {
      const read = await engine.readPublicKey(entry.publicKey);
      // The server files a key under the fingerprint it worked out. If the two ever disagreed, neither could be believed.
      if (read.fingerprint !== entry.fingerprint) throw new PgpError("not-a-key", "it is filed under a fingerprint that is not its own");
      const { publicKey, ...info } = read;
      seen.add(info.fingerprint);
      keys.push({
        fingerprint: info.fingerprint,
        info,
        publicKey,
        mine: entry.mine || entry.hasPrivateKey || info.fingerprint in device,
        onShelf: true,
        privateOnDevice: info.fingerprint in device,
        privateOnOutpost: entry.hasPrivateKey,
        checkedAt: checked[info.fingerprint] ?? null,
        addedAt: entry.addedAt,
      });
    } catch (error) {
      unreadable.push({ fingerprint: entry.fingerprint, reason: error instanceof Error ? error.message : "It could not be read." });
    }
  }

  // A private key in this browser whose public half is no longer on the shelf (someone removed it) is still this person's key.
  for (const [fingerprint, value] of Object.entries(device)) {
    if (seen.has(fingerprint)) continue;
    try {
      const { publicKey, isProtected: _isProtected, ...info } = await engine.readPrivateKey(value.privateKey);
      keys.push({
        fingerprint: info.fingerprint,
        info,
        publicKey,
        mine: true,
        onShelf: false,
        privateOnDevice: true,
        privateOnOutpost: false,
        checkedAt: checked[info.fingerprint] ?? null,
        addedAt: value.savedAt,
      });
    } catch (error) {
      unreadable.push({ fingerprint, reason: error instanceof Error ? error.message : "It could not be read." });
    }
  }
  return { keys, unreadable };
}

export function useShelf(enabled = true) {
  const client = useQueryClient();
  useEffect(() => onDeviceKeysChanged(() => void client.invalidateQueries({ queryKey: encryptionKeys.shelf })), [client]);
  return useQuery({ queryKey: encryptionKeys.shelf, queryFn: loadShelf, enabled, staleTime: 30_000 });
}

/** Fingerprints of the keys unlocked in this tab, with the time each will be forgotten. */
export const useUnlocked = (): ReadonlyMap<string, number> => useSyncExternalStore(subscribeUnlocked, unlockedSnapshot, unlockedSnapshot);

// ── Changing the shelf ──

export async function putPublicKey(publicKey: string, mine: boolean): Promise<void> {
  await api.put<StoredKeyResponse>("/api/encryption/keys", { publicKey, mine });
}
export async function putPrivateKeyOnOutpost(fingerprint: string, privateKey: string): Promise<void> {
  await api.put<StoredKeyResponse>(`/api/encryption/keys/${fingerprint}/private`, { privateKey });
}
export async function removePrivateKeyFromOutpost(fingerprint: string): Promise<void> {
  await api.delete<StoredKeyResponse>(`/api/encryption/keys/${fingerprint}/private`);
}
export async function deleteKeyFromOutpost(fingerprint: string): Promise<void> {
  await api.delete(`/api/encryption/keys/${fingerprint}`);
}

/** The protected private key, from this browser if it is here, otherwise from Outpost. */
export async function protectedPrivateKey(key: Pick<ShelfKey, "fingerprint" | "privateOnOutpost">): Promise<string> {
  const local = devicePrivateKey(key.fingerprint);
  if (local) return local;
  if (!key.privateOnOutpost) {
    throw new PgpError(
      "no-key",
      "The private half of this key is not on this device or on Outpost. Import it here from the device that has it.",
    );
  }
  return (await api.get<StoredPrivateKeyResponse>(`/api/encryption/keys/${key.fingerprint}/private`)).privateKey;
}

/** Unlocks a key with its passphrase and holds it for the idle time. */
export async function unlock(key: Pick<ShelfKey, "fingerprint" | "privateOnOutpost">, passphrase: string): Promise<UnlockedKey> {
  const held = unlockedKey(key.fingerprint);
  if (held) return held;
  const engine = await getEngine();
  const unlocked = await engine.unlock(await protectedPrivateKey(key), passphrase);
  if (unlocked.fingerprint.toLowerCase() !== key.fingerprint) {
    unlocked.forget();
    throw new PgpError("failed", "The private key stored for this key is a different key. It was not used.");
  }
  holdUnlocked(unlocked);
  return unlocked;
}

export const canUsePrivate = (key: ShelfKey): boolean => key.privateOnDevice || key.privateOnOutpost;
