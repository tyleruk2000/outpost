/**
 * Comparing the server's clock with this device's. The server's time is read over the
 * network, so it is taken to belong to the middle of the request: half the round trip
 * after it was sent. A difference within `CLOCK_TOLERANCE_MS` is no difference.
 */
import { CLOCK_TOLERANCE_MS, formatDuration, type ServerClock } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DEVICE } from "../kept/device";

export interface ClockReading {
  server: ServerClock;
  /** The server's clock less this device's, in milliseconds: negative when the server is behind. */
  offsetMs: number;
}

export function offsetOf(serverNow: number, sentAt: number, receivedAt: number): number {
  return Math.round(serverNow - (sentAt + receivedAt) / 2);
}

export const clockIsWrong = (offsetMs: number) => Math.abs(offsetMs) > CLOCK_TOLERANCE_MS;

/** "The server's clock is 3 hours 12 minutes behind this phone's." */
export function offsetSentence(offsetMs: number, device: string = DEVICE): string {
  const amount = formatDuration(Math.abs(offsetMs) / 1000);
  return `The server's clock is ${amount} ${offsetMs < 0 ? "behind" : "ahead of"} this ${device}'s.`;
}

/** The server's clock and how far it is from this device's. Read once a visit: the difference does not drift in minutes. */
export function useServerClock() {
  return useQuery({
    queryKey: ["device", "clock"],
    queryFn: async (): Promise<ClockReading> => {
      const sentAt = Date.now();
      const server = await api.get<ServerClock>("/api/device/clock");
      return { server, offsetMs: offsetOf(server.now, sentAt, Date.now()) };
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
