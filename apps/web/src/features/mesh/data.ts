/**
 * The mesh radio link's data: its set-up and state, the devices that may be a radio, and
 * a test message. Every key starts with "mesh", which `mesh.changed` refreshes
 * (`lib/events.tsx`) whenever the state changes: a radio connected, something heard.
 * Nothing polls.
 *
 * Also the radio channel this device last chose on Messages, kept in this browser only.
 */
import {
  BOARD_CHANNEL,
  type BoardMessageResponse,
  type MeshCoreInput,
  type MeshDevicesResponse,
  type MeshResponse,
  type MeshTestInput,
  type MeshtasticInput,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

export const MESH_KEY = ["mesh"];
const DEVICES_KEY = ["mesh", "devices"];

export const useMesh = () => useQuery({ queryKey: MESH_KEY, queryFn: () => api.get<MeshResponse>("/api/mesh") });

/** The devices that may be a radio, asked for only while "By USB cable" is chosen. */
export const useMeshDevices = (enabled: boolean) =>
  useQuery({ queryKey: DEVICES_KEY, queryFn: () => api.get<MeshDevicesResponse>("/api/mesh/devices"), enabled });

export function useSaveMeshtastic() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MeshtasticInput) => api.put<MeshResponse>("/api/mesh/meshtastic", input),
    onSuccess: (data) => {
      client.setQueryData(MESH_KEY, data);
      void client.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export function useSaveMeshCore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MeshCoreInput) => api.put<MeshResponse>("/api/mesh/meshcore", input),
    onSuccess: (data) => {
      client.setQueryData(MESH_KEY, data);
      void client.invalidateQueries({ queryKey: ["board"] });
    },
  });
}

export function useMeshTest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MeshTestInput) => api.post<BoardMessageResponse>("/api/mesh/test", input),
    onSuccess: ({ message }) => void client.invalidateQueries({ queryKey: ["board", "messages", message.channel] }),
  });
}

/** A password for the broker, made in the browser: 20 letters and digits, with none that are easily mistaken for another. */
export function suggestPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // 256 is not a multiple of the alphabet's length: a value past the last whole multiple is left out, so that no letter is likelier.
  const limit = 256 - (256 % letters.length);
  const bytes = new Uint8Array(32);
  let out = "";
  while (out.length < 20) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) if (byte < limit && out.length < 20) out += letters[byte % letters.length];
  }
  return out;
}

// ── The channel chosen on Messages, kept on this device ──

const CHANNEL_KEY = "outpost.board.channel";
const listeners = new Set<() => void>();
let fallback: string | null = null;

function readChannel(): string {
  try {
    return localStorage.getItem(CHANNEL_KEY) ?? fallback ?? BOARD_CHANNEL;
  } catch {
    return fallback ?? BOARD_CHANNEL;
  }
}

export function setBoardChannel(channel: string): void {
  try {
    if (channel === BOARD_CHANNEL) localStorage.removeItem(CHANNEL_KEY);
    else localStorage.setItem(CHANNEL_KEY, channel);
  } catch {
    // Storage refused: kept for this visit only.
    fallback = channel;
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The channel last chosen on this device; "board" for Home. Whether it is still carried is for the caller to check. */
export const useStoredBoardChannel = () => useSyncExternalStore(subscribe, readChannel, () => BOARD_CHANNEL);
